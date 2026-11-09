"""Building the exercise a card is shown as (flashcard, MCQ, fill-in-the-blank)."""

import random
from typing import Any, Literal

from app.schemas.capture import Vertex
from app.schemas.flashcard import (
    Distractors,
    FlashcardResponse,
    JpOption,
    ReviewStage,
    Sighting,
    card_has_photo,
)
from app.schemas.review import (
    Example,
    Exercise,
    FillBlankExercise,
    FlashcardBack,
    FlashcardExercise,
    GapBox,
    McqExercise,
    PhotoLayer,
)
from app.services.review_rules.cards import capture_format, effective_stage
from app.services.review_rules.distractors import WRONG_PER_QUESTION
from app.services.review_rules.grading import accepted_answers_for
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
        caption=f"Your photo · {area}" if area else "Your photo",
    )


def _next_step_text(card: FlashcardResponse) -> str:
    steps_left = MAX_STRENGTH - card.strength
    return (
        f"{steps_left} more step{'s' if steps_left != 1 else ''} until it's a star on your map."
        if steps_left > 0
        else "It's already a star on your map."
    )


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
    exercise_id = f"{session_id}-{position}"
    area = area_of(card)
    seed = f"{session_id}:{card.flashcard_id}:{position}"
    stage = effective_stage(card)
    qtype = pick_question_type(card, seed)
    photo = _photo_layer(card, stage, area)
    example = _pick_example(card)
    place_hint = (
        f"You saved this at {area}." if area else "No place saved for this one."
    )
    next_step = _next_step_text(card)
    promoted_to, demoted_to = _stage_transitions(card, stage)
    jp_prompt = JpOption(text=card.kanji, reading=card.reading, romaji=card.romaji)

    if qtype in ("flashcard_text", "flashcard_object"):
        return FlashcardExercise(
            id=exercise_id,
            question_type=qtype,
            stage=stage,
            flashcard_id=card.flashcard_id,
            photo=photo,
            front=jp_prompt if qtype == "flashcard_text" else None,
            back=FlashcardBack(
                text=card.kanji,
                reading=card.reading,
                romaji=card.romaji,
                meaning=card.meaning,
                example=example,
            ),
            place_hint=place_hint,
            next_step=next_step,
            promoted_to=promoted_to,
            demoted_to=demoted_to,
        )

    if qtype in (
        "mcq_text_reading",
        "mcq_text_translate",
        "mcq_text_reverse",
        "mcq_object_name",
    ):
        if qtype == "mcq_text_reading":
            options, answer = _shuffle_with_answer(
                card.reading, distractors.readings, seed
            )
            prompt_kind: Literal["jp", "meaning", "photo"] = "jp"
        elif qtype == "mcq_text_translate":
            options, answer = _shuffle_with_answer(
                card.meaning, distractors.meanings, seed
            )
            prompt_kind = "photo" if photo is not None else "jp"
        elif qtype == "mcq_text_reverse":
            options, answer = _shuffle_with_answer(jp_prompt, distractors.words, seed)
            prompt_kind = "meaning"
        else:  # mcq_object_name
            options, answer = _shuffle_with_answer(jp_prompt, distractors.words, seed)
            prompt_kind = "photo"

        return McqExercise(
            id=exercise_id,
            question_type=qtype,
            stage=stage,
            flashcard_id=card.flashcard_id,
            photo=photo,
            prompt_kind=prompt_kind,
            prompt=jp_prompt,
            meaning_prompt=card.meaning,
            options=options,
            answer_index=answer,
            place_hint=place_hint,
            example=example,
            next_step=next_step,
            promoted_to=promoted_to,
            demoted_to=demoted_to,
        )

    # Fill in the blank
    answer_kind: Literal["kana", "meaning"] = (
        "meaning" if qtype == "fill_text_translate" else "kana"
    )
    accepted = accepted_answers_for(card, qtype)
    if qtype == "fill_text_reading":
        answer_display = card.reading
    elif qtype == "fill_text_translate":
        answer_display = card.meaning
    else:
        answer_display = (
            f"{card.kanji} ({card.reading})"
            if card.reading and card.reading != card.kanji
            else card.kanji
        )

    return FillBlankExercise(
        id=exercise_id,
        question_type=qtype,
        stage=stage,
        flashcard_id=card.flashcard_id,
        photo=photo,
        prompt=jp_prompt,
        meaning_prompt=card.meaning,
        cloze=build_cloze(card),
        answer_kind=answer_kind,
        accepted_answers=accepted,
        answer_display=answer_display,
        place_hint=place_hint,
        example=example,
        next_step=next_step,
        promoted_to=promoted_to,
        demoted_to=demoted_to,
    )
