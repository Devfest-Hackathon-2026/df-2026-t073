"""Building the exercise a card is shown as (flashcard, MCQ, fill-in-the-blank)."""

import random
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from app.schemas.capture import Vertex
from app.schemas.flashcard import (
    Distractors,
    FlashcardResponse,
    JpOption,
    Sighting,
)
from app.schemas.review import (
    Example,
    Exercise,
    ExerciseKey,
    FillBlankExercise,
    FlashcardBack,
    FlashcardExercise,
    GapBox,
    McqExercise,
    PhotoLayer,
)
from app.schemas.review_types import QuestionType, ReviewStage
from app.services.review_rules.cards import (
    capture_format,
    card_has_photo,
    effective_stage,
)
from app.services.review_rules.distractors import WRONG_PER_QUESTION
from app.services.review_rules.grading import accepted_answers_for
from app.services.review_rules.question_types import QUESTIONS, Family
from app.services.review_rules.questions import pick_question_type
from app.services.review_rules.selection import area_of
from app.services.review_rules.stages import next_stage, shows_photo
from app.services.tango_rules import MAX_STRENGTH

# Padding around a detected item so the whole word is highlighted, in normalized units.
GAP_PADDING = 0.02


def gap_from_bbox(vertices: list[Vertex]) -> GapBox:
    """Rectangle around the detected item, padded and kept inside the photo."""
    xs = [v.x for v in vertices]
    ys = [v.y for v in vertices]
    x0 = max(0.0, min(xs) - GAP_PADDING)
    y0 = max(0.0, min(ys) - GAP_PADDING)
    x1 = min(1.0, max(xs) + GAP_PADDING)
    y1 = min(1.0, max(ys) + GAP_PADDING)
    return GapBox(x=x0, y=y0, w=x1 - x0, h=y1 - y0)


def backfill_photo_fields(
    card: FlashcardResponse,
    sighting: Sighting,
    bounding_box: list[Vertex] | None = None,
) -> dict[str, Any]:
    """When a photo catch adds a sighting to a card that had no photo, fill it in."""
    if card.image_url or not sighting.image_url:
        return {}
    updates: dict[str, Any] = {
        "image_url": sighting.image_url,
        "capture_id": sighting.capture_id or card.capture_id,
    }
    if bounding_box:
        updates["bounding_box"] = list(bounding_box)
    return updates


def _shuffle_with_answer(
    correct: Any, wrong: list[Any], seed: str
) -> tuple[list[Any], int]:
    options = [correct, *wrong[:WRONG_PER_QUESTION]]
    random.Random(seed).shuffle(options)
    return options, options.index(correct)


def _pick_example(card: FlashcardResponse) -> Example | None:
    easy = next((u for u in card.use_cases if u.speech_register == "easy"), None)
    chosen = easy or (card.use_cases[0] if card.use_cases else None)
    if not chosen:
        return None
    return Example(
        japanese=chosen.japanese, reading=chosen.reading, english=chosen.english
    )


def build_cloze(card: FlashcardResponse) -> Example | None:
    """Find a use_case whose Japanese contains card.kanji and blank out that word."""
    target = card.kanji.strip()
    if not target:
        return None
    ordered = sorted(
        card.use_cases, key=lambda u: 0 if u.speech_register == "easy" else 1
    )
    for u in ordered:
        if target in u.japanese:
            blanked_jp = u.japanese.replace(target, "＿＿＿", 1)
            reading_target = card.reading.strip()
            blanked_reading = (
                u.reading.replace(reading_target, "＿＿＿", 1)
                if reading_target and reading_target in u.reading
                else u.reading
            )
            return Example(
                japanese=blanked_jp,
                reading=blanked_reading,
                english=u.english,
            )
    return None


def _photo_layer(
    card: FlashcardResponse, stage: ReviewStage, area: str
) -> PhotoLayer | None:
    fmt = capture_format(card)
    has_photo = card_has_photo(card)
    if not shows_photo(stage, fmt, has_photo):
        return None
    return PhotoLayer(
        image_url=card.image_url,
        box=gap_from_bbox(card.bounding_box),
        area=area,
    )


def _steps_to_stamp(card: FlashcardResponse) -> int:
    """Steps until the Tango is a Stamp (full strength)."""
    return max(0, MAX_STRENGTH - card.strength)


def _stage_transitions(
    card: FlashcardResponse, stage: ReviewStage
) -> tuple[ReviewStage | None, ReviewStage | None]:
    fmt = capture_format(card)
    has_photo = card_has_photo(card)
    stats = card.review_stats.model_copy(update={"stage": stage})
    after_right = next_stage(stats, fmt, True, has_photo=has_photo)
    after_wrong = next_stage(stats, fmt, False, has_photo=has_photo)
    promoted = after_right.stage if after_right.stage != stage else None
    demoted = after_wrong.stage if after_wrong.stage != stage else None
    return promoted, demoted


@dataclass(frozen=True, slots=True)
class _Context:
    """What every exercise for one card in one session shares."""

    card: FlashcardResponse
    distractors: Distractors
    question_type: QuestionType
    exercise_id: str
    seed: str
    stage: ReviewStage
    photo: PhotoLayer | None
    example: Example | None
    place_hint: str
    steps_to_stamp: int
    promoted_to: ReviewStage | None
    demoted_to: ReviewStage | None
    jp_prompt: JpOption


type _PromptKind = Literal["jp", "meaning", "photo"]
type _McqChoices = tuple[JpOption | str, list[JpOption] | list[str], _PromptKind]


def _mcq_reading(ctx: _Context) -> _McqChoices:
    return ctx.card.reading, ctx.distractors.readings, "jp"


def _mcq_translate(ctx: _Context) -> _McqChoices:
    prompt_kind: _PromptKind = "photo" if ctx.photo is not None else "jp"
    return ctx.card.meaning, ctx.distractors.meanings, prompt_kind


def _mcq_reverse(ctx: _Context) -> _McqChoices:
    return ctx.jp_prompt, ctx.distractors.words, "meaning"


def _mcq_object_name(ctx: _Context) -> _McqChoices:
    return ctx.jp_prompt, ctx.distractors.words, "photo"


# Right answer, wrong-answer pool and prompt for each multiple-choice question type.
_MCQ_CHOICES: dict[QuestionType, Callable[[_Context], _McqChoices]] = {
    "mcq_text_reading": _mcq_reading,
    "mcq_text_translate": _mcq_translate,
    "mcq_text_reverse": _mcq_reverse,
    "mcq_object_name": _mcq_object_name,
}


def _flashcard_exercise(ctx: _Context) -> FlashcardExercise:
    card = ctx.card
    return FlashcardExercise(
        id=ctx.exercise_id,
        question_type=ctx.question_type,  # type: ignore[arg-type]  # QUESTIONS family guarantees a flashcard_* type
        stage=ctx.stage,
        flashcard_id=card.flashcard_id,
        photo=ctx.photo,
        front=ctx.jp_prompt if ctx.question_type == "flashcard_text" else None,
        back=FlashcardBack(
            text=card.kanji,
            reading=card.reading,
            romaji=card.romaji,
            meaning=card.meaning,
            example=ctx.example,
        ),
        place_hint=ctx.place_hint,
        steps_to_stamp=ctx.steps_to_stamp,
        promoted_to=ctx.promoted_to,
        demoted_to=ctx.demoted_to,
    )


def _mcq_exercise(ctx: _Context) -> McqExercise:
    correct, wrong, prompt_kind = _MCQ_CHOICES[ctx.question_type](ctx)
    options, answer = _shuffle_with_answer(correct, wrong, ctx.seed)
    return McqExercise(
        id=ctx.exercise_id,
        question_type=ctx.question_type,  # type: ignore[arg-type]  # QUESTIONS family guarantees an mcq_* type
        stage=ctx.stage,
        flashcard_id=ctx.card.flashcard_id,
        photo=ctx.photo,
        prompt_kind=prompt_kind,
        prompt=ctx.jp_prompt,
        meaning_prompt=ctx.card.meaning,
        options=options,
        answer_index=answer,
        place_hint=ctx.place_hint,
        example=ctx.example,
        steps_to_stamp=ctx.steps_to_stamp,
        promoted_to=ctx.promoted_to,
        demoted_to=ctx.demoted_to,
    )


def _answer_display(card: FlashcardResponse, question_type: QuestionType) -> str:
    if question_type == "fill_text_reading":
        return card.reading
    if question_type == "fill_text_translate":
        return card.meaning
    if card.reading and card.reading != card.kanji:
        return f"{card.kanji} ({card.reading})"
    return card.kanji


def _fill_exercise(ctx: _Context) -> FillBlankExercise:
    card = ctx.card
    return FillBlankExercise(
        id=ctx.exercise_id,
        question_type=ctx.question_type,  # type: ignore[arg-type]  # QUESTIONS family guarantees a fill_* type
        stage=ctx.stage,
        flashcard_id=card.flashcard_id,
        photo=ctx.photo,
        prompt=ctx.jp_prompt,
        meaning_prompt=card.meaning,
        cloze=build_cloze(card),
        answer_kind=QUESTIONS[ctx.question_type].answer_kind or "kana",
        accepted_answers=accepted_answers_for(card, ctx.question_type),
        answer_display=_answer_display(card, ctx.question_type),
        place_hint=ctx.place_hint,
        example=ctx.example,
        steps_to_stamp=ctx.steps_to_stamp,
        promoted_to=ctx.promoted_to,
        demoted_to=ctx.demoted_to,
    )


_BUILDERS: dict[Family, Callable[[_Context], Exercise]] = {
    "flashcard": _flashcard_exercise,
    "mcq": _mcq_exercise,
    "fill": _fill_exercise,
}


def build_exercise(
    card: FlashcardResponse,
    distractors: Distractors,
    position: int,
    session_id: str,
) -> Exercise:
    """Build the staged exercise (flashcard, MCQ, or fill-in-the-blank) for a card.

    Typed meanings are accepted from card.meaning_synonyms only (what the server grades
    against), never from distractors.synonyms.
    """
    area = area_of(card)
    seed = f"{session_id}:{card.flashcard_id}:{position}"
    stage = effective_stage(card)
    qtype = pick_question_type(card, seed)
    promoted_to, demoted_to = _stage_transitions(card, stage)
    ctx = _Context(
        card=card,
        distractors=distractors,
        question_type=qtype,
        exercise_id=f"{session_id}-{position}",
        seed=seed,
        stage=stage,
        photo=_photo_layer(card, stage, area),
        example=_pick_example(card),
        place_hint=area,
        steps_to_stamp=_steps_to_stamp(card),
        promoted_to=promoted_to,
        demoted_to=demoted_to,
        jp_prompt=JpOption(text=card.kanji, reading=card.reading, romaji=card.romaji),
    )
    return _BUILDERS[QUESTIONS[qtype].family](ctx)


def exercise_key(exercise: Exercise) -> ExerciseKey:
    """The grading key saved with the session for one exercise."""
    key = ExerciseKey(
        exercise_id=exercise.id,
        flashcard_id=exercise.flashcard_id,
        question_type=exercise.question_type,
        stage=exercise.stage,
    )
    match exercise:
        case McqExercise():
            return key.model_copy(update={"answer_index": exercise.answer_index})
        case FillBlankExercise():
            return key.model_copy(
                update={
                    "answer_kind": exercise.answer_kind,
                    "accepted_answers": list(exercise.accepted_answers),
                }
            )
        case FlashcardExercise():
            return key
