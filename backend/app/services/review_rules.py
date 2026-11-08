"""Pure rules for review sessions: which cards, which questions, what the results say.

No I/O here, so these are unit-tested directly (tests/test_review_rules.py).
"""

import math
import random
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Literal

from app.schemas.capture import Vertex
from app.schemas.flashcard import (
    CaptureFormat,
    Distractors,
    FlashcardResponse,
    JpOption,
    QuestionType,
    ReviewStage,
    ReviewStats,
    Sighting,
)
from app.schemas.review import (
    AreaCount,
    BiggestWin,
    Example,
    Exercise,
    ExerciseType,
    FillBlankExercise,
    FlashcardBack,
    FlashcardExercise,
    GapBox,
    McqExercise,
    PhotoLayer,
    SessionAnswer,
)
from app.services.tango_rules import MAX_STRENGTH, clean_place_name

Rating = Literal["again", "good", "easy"]

SESSION_SIZE = 10
SECONDS_PER_CARD = 20
OPTIONS_PER_QUESTION = 4
WRONG_PER_QUESTION = OPTIONS_PER_QUESTION - 1
PLACE_CUE_COLLECTION = "place-cue"
FAVORITES_COLLECTION = "favorites"
LIST_PREFIX = "list:"
PLACE_PREFIX = "place:"
AREA_PREFIX = "area:"
# Padding around a detected item so the whole word is highlighted, in normalized units.
GAP_PADDING = 0.02

# Stage progression thresholds (consecutive correct answers to promote, misses to demote).
PROMOTE: dict[ReviewStage, int] = {
    "flashcard": 2,
    "mcq_photo": 2,
    "mcq": 3,
}
DEMOTE_MISSES = 2
STAGE_ORDER: dict[ReviewStage, int] = {
    "flashcard": 0,
    "mcq_photo": 1,
    "mcq": 2,
    "fill": 3,
}

# Last resort when Gemini and the user's other cards can't supply enough wrong answers.
FALLBACK_MEANINGS = ["exit", "entrance", "receipt", "closed", "open", "discount", "station"]
FALLBACK_WORDS = [
    JpOption(text="出口", reading="でぐち", romaji="deguchi"),
    JpOption(text="入口", reading="いりぐち", romaji="iriguchi"),
    JpOption(text="営業中", reading="えいぎょうちゅう", romaji="eigyōchū"),
    JpOption(text="禁煙", reading="きんえん", romaji="kin'en"),
    JpOption(text="改札", reading="かいさつ", romaji="kaisatsu"),
    JpOption(text="会計", reading="かいけい", romaji="kaikei"),
]
FALLBACK_OBJECT_WORDS = [
    JpOption(text="自動販売機", reading="じどうはんばいき", romaji="jidō hanbaiki"),
    JpOption(text="改札機", reading="かいさつき", romaji="kaisatsuki"),
    JpOption(text="ゴミ箱", reading="ごみばこ", romaji="gomibako"),
    JpOption(text="傘立て", reading="かさたて", romaji="kasatate"),
    JpOption(text="券売機", reading="けんばいき", romaji="kenbaiki"),
    JpOption(text="おしぼり", reading="おしぼり", romaji="oshibori"),
]
FALLBACK_READINGS = [
    "でぐち",
    "いりぐち",
    "えいぎょうちゅう",
    "きんえん",
    "かいさつ",
    "かいけい",
]

_KANJI_OR_LATIN_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff々a-zA-Z]")
_LATIN_RE = re.compile(r"[a-zA-Z]")
_PAREN_RE = re.compile(r"\s*\([^)]*\)")
_LEADING_ARTICLE_RE = re.compile(r"^(?:to|a|an|the)\s+", re.IGNORECASE)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def is_due(card: FlashcardResponse, now: datetime) -> bool:
    return _aware(card.review_stats.next_review_at) <= now


def area_of(card: FlashcardResponse) -> str:
    """The place this Tango was most recently found, or "" if none was named."""
    named = [s for s in card.sightings if clean_place_name(s.place_name)]
    if not named:
        return ""
    return max(named, key=lambda s: _aware(s.seen_at)).place_name


def estimate_minutes(card_count: int) -> int:
    return math.ceil(card_count * SECONDS_PER_CARD / 60) if card_count else 0


def area_id(name: str) -> str:
    """Stable id for an area name, e.g. 'Koenji' -> 'koenji' (matches the Today map)."""
    return name.strip().lower().replace(" ", "-")


def in_collection(
    card: FlashcardResponse,
    collection: str | None,
    area_by_place: dict[str, str] | None = None,
    list_ids: set[str] | None = None,
) -> bool:
    if not collection:
        return True
    if collection == FAVORITES_COLLECTION:
        return card.favorite
    if collection.startswith(LIST_PREFIX):
        return card.flashcard_id in (list_ids or set())
    if collection.startswith(AREA_PREFIX):
        wanted = collection[len(AREA_PREFIX) :]
        areas = area_by_place or {}
        return any(
            area_id(areas.get(s.place_id or "", "") or s.place_name) == wanted
            for s in card.sightings
        )
    if collection == PLACE_CUE_COLLECTION:
        return bool(area_of(card))
    if collection.startswith(PLACE_PREFIX):
        name = collection[len(PLACE_PREFIX) :]
        return any(s.place_name == name for s in card.sightings)
    return False


def pick_session_cards(
    cards: list[FlashcardResponse],
    now: datetime,
    collection: str | None = None,
    limit: int = SESSION_SIZE,
    area_by_place: dict[str, str] | None = None,
    list_ids: set[str] | None = None,
) -> list[FlashcardResponse]:
    """Weakest due cards first.

    Without a collection, only due cards. With a collection (the user chose
    "Review these"), not-yet-due cards fill the rest so practice is always possible.
    """
    chosen = [c for c in cards if in_collection(c, collection, area_by_place, list_ids)]
    due = [c for c in chosen if is_due(c, now)]
    due.sort(key=lambda c: (c.strength, _aware(c.review_stats.next_review_at)))
    if not collection:
        return due[:limit]
    rest = [c for c in chosen if not is_due(c, now)]
    rest.sort(key=lambda c: (c.strength, _aware(c.review_stats.next_review_at)))
    return (due + rest)[:limit]


def can_fill_gap(card: FlashcardResponse) -> bool:
    """True when the card has an uploaded capture photo and bounding box."""
    return bool(card.image_url) and len(card.bounding_box) >= 2


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


# ---- Format, stage progression & question selection ----


def capture_format(card: FlashcardResponse) -> CaptureFormat:
    """Whether the Tango was captured via object recognition or OCR text."""
    if card.capture_format in ("object", "text"):
        return card.capture_format
    return "object" if card.kind == "object" else "text"


def stage_path(fmt: CaptureFormat, has_photo: bool = True) -> tuple[ReviewStage, ...]:
    """Ordered review stages for a card's format and photo availability."""
    if fmt == "object" or not has_photo:
        return ("flashcard", "mcq", "fill")
    return ("flashcard", "mcq_photo", "mcq", "fill")


def infer_stage(strength: int, fmt: CaptureFormat, has_photo: bool = True) -> ReviewStage:
    """Work out the starting stage for older cards that have no stored stage."""
    if strength <= 1:
        return "flashcard"
    if strength == 2:
        return "mcq_photo" if (fmt == "text" and has_photo) else "mcq"
    if strength == 3:
        return "mcq"
    return "fill"


def effective_stage(card: FlashcardResponse) -> ReviewStage:
    """The card's active review stage, normalized for its format and photo availability."""
    fmt = capture_format(card)
    has_photo = can_fill_gap(card)
    stage = card.review_stats.stage or infer_stage(card.strength, fmt, has_photo)
    if stage == "mcq_photo" and (fmt == "object" or not has_photo):
        return "mcq"
    return stage


def shows_photo(stage: ReviewStage, fmt: CaptureFormat, has_photo: bool = True) -> bool:
    """Whether an exercise at this stage and format renders the capture photo."""
    if not has_photo:
        return False
    if fmt == "object":
        return True
    return stage in ("flashcard", "mcq_photo")


def next_stage(
    stats: ReviewStats,
    fmt: CaptureFormat,
    correct: bool,
    *,
    has_photo: bool = True,
    question_type: QuestionType | None = None,
) -> ReviewStats:
    """Advance or demote one step along the card's stage path; streaks reset on stage change."""
    path = stage_path(fmt, has_photo)
    current: ReviewStage = stats.stage or "flashcard"
    if current not in path:
        current = "mcq" if current == "mcq_photo" else "flashcard"
    idx = path.index(current)

    if correct:
        streak = stats.stage_streak + 1
        need = PROMOTE.get(current)
        if need is not None and streak >= need and idx + 1 < len(path):
            new_stage = path[idx + 1]
            stage_streak = 0
        else:
            new_stage = current
            stage_streak = streak
        miss_streak = 0
    else:
        misses = stats.miss_streak + 1
        if misses >= DEMOTE_MISSES and idx > 0:
            new_stage = path[idx - 1]
            miss_streak = 0
        else:
            new_stage = current
            miss_streak = misses
        stage_streak = 0

    return stats.model_copy(
        update={
            "stage": new_stage,
            "stage_streak": stage_streak,
            "miss_streak": miss_streak,
            "last_question_type": (
                question_type if question_type is not None else stats.last_question_type
            ),
        }
    )


def rating_for_answer(
    question_type: QuestionType | None,
    correct: bool | None,
    client_rating: Rating | None = None,
) -> Rating:
    """Derive the review rating from the question type and whether the answer was right."""
    if question_type and question_type.startswith("fill_"):
        if correct is None:
            return "easy" if client_rating in ("good", "easy") else "again"
        return "easy" if correct else "again"
    if question_type and question_type.startswith("mcq_"):
        if correct is None:
            return "good" if client_rating in ("good", "easy") else "again"
        return "good" if correct else "again"
    if client_rating is not None:
        return client_rating
    return "good" if correct else "again"


# ---- Strict answer normalization & checking ----


def katakana_to_hiragana(text: str) -> str:
    """Fold full-width katakana (ァ..ヶ) to hiragana (ぁ..ゖ). Keeps 'ー' as is."""
    chars: list[str] = []
    for ch in text:
        code = ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            chars.append(chr(code - 0x60))
        else:
            chars.append(ch)
    return "".join(chars)


def normalize_answer(text: str) -> str:
    """NFKC, trim, lowercase, and convert katakana to hiragana."""
    folded = unicodedata.normalize("NFKC", text).strip().lower()
    return katakana_to_hiragana(folded)


def is_kana_only(card: FlashcardResponse) -> bool:
    """True when the word has no kanji to test reading on (kanji == reading in kana)."""
    if not card.reading.strip():
        return True
    return normalize_answer(card.kanji) == normalize_answer(card.reading)


def has_non_kana_for_reading(text: str) -> bool:
    """True when a reading answer contains kanji or Latin letters (shows a hint, not wrong)."""
    folded = unicodedata.normalize("NFKC", text).strip()
    return bool(folded and _KANJI_OR_LATIN_RE.search(folded))


def normalize_meaning(text: str) -> str:
    """Case-insensitive normalized meaning with optional leading 'to '/'a '/'an '/'the ' stripped."""
    collapsed = re.sub(r"\s+", " ", normalize_answer(text)).strip()
    stripped = _LEADING_ARTICLE_RE.sub("", collapsed).strip()
    return stripped or collapsed


def accepted_meanings(card: FlashcardResponse) -> list[str]:
    """All accepted meaning strings: full meaning, individual glosses, and synonyms."""
    raw_candidates: list[str] = [card.meaning, *card.meaning_synonyms]
    for item in [card.meaning, *card.meaning_synonyms]:
        without_parens = _PAREN_RE.sub("", item).strip()
        if without_parens:
            raw_candidates.append(without_parens)
        for part in re.split(r"[,;/]", item):
            clean = part.strip()
            if clean:
                raw_candidates.append(clean)
            clean_no_parens = _PAREN_RE.sub("", clean).strip()
            if clean_no_parens:
                raw_candidates.append(clean_no_parens)

    seen: set[str] = set()
    out: list[str] = []
    for candidate in raw_candidates:
        key = normalize_meaning(candidate)
        if key and key not in seen:
            seen.add(key)
            out.append(candidate.strip())
    return out


def accepted_answers_for(card: FlashcardResponse, question_type: QuestionType) -> list[str]:
    """Accepted strings for a fill-in-the-blank question."""
    if question_type == "fill_text_reading":
        reading = card.reading.strip() or card.kanji.strip()
        return [reading] if reading else []
    if question_type in ("fill_text_reverse", "fill_object_name"):
        out: list[str] = []
        for val in (card.kanji.strip(), card.reading.strip()):
            if val and val not in out:
                out.append(val)
        return out
    if question_type == "fill_text_translate":
        return accepted_meanings(card)
    return []


def check_fill_answer(
    answer: str,
    accepted_answers: list[str],
    answer_kind: Literal["kana", "meaning"],
) -> bool:
    """Grade a typed answer against accepted_answers."""
    if not answer or not answer.strip():
        return False
    if answer_kind == "meaning":
        given = normalize_meaning(answer)
        return bool(given) and any(given == normalize_meaning(a) for a in accepted_answers)

    # Japanese answer (reading, reverse, or object name): romaji is never accepted.
    folded = unicodedata.normalize("NFKC", answer).strip()
    if _LATIN_RE.search(folded):
        return False
    given = normalize_answer(folded)
    return bool(given) and any(given == normalize_answer(a) for a in accepted_answers)


def check_card_answer(
    card: FlashcardResponse,
    question_type: QuestionType,
    answer: str,
) -> bool:
    """Grade a typed answer for a specific card and question type."""
    if question_type == "fill_text_reading" and has_non_kana_for_reading(answer):
        return False
    answer_kind: Literal["kana", "meaning"] = (
        "meaning" if question_type == "fill_text_translate" else "kana"
    )
    return check_fill_answer(answer, accepted_answers_for(card, question_type), answer_kind)


def pick_question_type(card: FlashcardResponse, seed: str = "") -> QuestionType:
    """Pick the question type for a card's stage and format, rotating away from last_question_type."""
    fmt = capture_format(card)
    stage = effective_stage(card)

    if fmt == "object":
        if stage == "flashcard":
            return "flashcard_object"
        if stage == "fill":
            return "fill_object_name"
        return "mcq_object_name"

    if stage == "flashcard":
        return "flashcard_text"
    if stage == "mcq_photo":
        return "mcq_text_translate"

    if stage == "mcq":
        candidates: list[QuestionType] = [
            "mcq_text_reading",
            "mcq_text_translate",
            "mcq_text_reverse",
        ]
        if is_kana_only(card):
            candidates.remove("mcq_text_reading")
    else:
        candidates = [
            "fill_text_reading",
            "fill_text_translate",
            "fill_text_reverse",
        ]
        if is_kana_only(card):
            candidates.remove("fill_text_reading")

    last = card.review_stats.last_question_type
    if len(candidates) > 1 and last in candidates:
        candidates = [c for c in candidates if c != last]

    if not seed:
        return candidates[0]
    return random.Random(seed).choice(candidates)


# ---- Distractors & exercise builders ----


def _unique_meanings(items: list[str], exclude_norm: set[str]) -> list[str]:
    seen = set(exclude_norm)
    out: list[str] = []
    for item in items:
        key = normalize_meaning(item)
        if key and key not in seen:
            seen.add(key)
            out.append(item.strip())
    return out


def complete_distractors(
    card: FlashcardResponse,
    found: Distractors | None,
    others: list[FlashcardResponse],
) -> Distractors:
    """Make sure a card has enough wrong answers: Gemini's first, then the
    user's other cards (same capture_format preferred), then a built-in list."""
    found = found or Distractors()
    fmt = capture_format(card)

    other_cards = [o for o in others if o.flashcard_id != card.flashcard_id]
    other_cards.sort(key=lambda o: 0 if capture_format(o) == fmt else 1)

    synonyms = [*card.meaning_synonyms, *found.synonyms]
    card_with_synonyms = (
        card.model_copy(update={"meaning_synonyms": synonyms})
        if synonyms and synonyms != card.meaning_synonyms
        else card
    )
    excluded_meanings = {normalize_meaning(m) for m in accepted_meanings(card_with_synonyms)}
    excluded_meanings.add(card.meaning.strip().lower())

    meanings = _unique_meanings(
        [
            *found.meanings,
            *(o.meaning for o in other_cards),
            *FALLBACK_MEANINGS,
        ],
        exclude_norm=excluded_meanings,
    )[:WRONG_PER_QUESTION]

    fallback_words = (
        [*FALLBACK_OBJECT_WORDS, *FALLBACK_WORDS]
        if fmt == "object"
        else [*FALLBACK_WORDS, *FALLBACK_OBJECT_WORDS]
    )
    word_pool = [
        *found.words,
        *(
            JpOption(text=o.kanji, reading=o.reading, romaji=o.romaji)
            for o in other_cards
        ),
        *fallback_words,
    ]
    seen_words = {card.kanji.strip()}
    seen_word_readings = {normalize_answer(card.reading)} if card.reading.strip() else set()
    words: list[JpOption] = []
    for word in word_pool:
        text_key = word.text.strip()
        reading_key = normalize_answer(word.reading) if word.reading.strip() else ""
        if (
            text_key
            and text_key not in seen_words
            and (not reading_key or reading_key not in seen_word_readings)
        ):
            seen_words.add(text_key)
            if reading_key:
                seen_word_readings.add(reading_key)
            words.append(word)
        if len(words) == WRONG_PER_QUESTION:
            break

    reading_pool = [
        *found.readings,
        *(o.reading for o in other_cards if o.reading.strip()),
        *FALLBACK_READINGS,
    ]
    seen_readings = {
        normalize_answer(card.reading),
        normalize_answer(card.kanji),
    }
    readings: list[str] = []
    for reading in reading_pool:
        norm_r = normalize_answer(reading)
        if reading.strip() and norm_r and norm_r not in seen_readings:
            seen_readings.add(norm_r)
            readings.append(reading.strip())
        if len(readings) == WRONG_PER_QUESTION:
            break

    return Distractors(
        meanings=meanings,
        words=words,
        readings=readings,
        synonyms=synonyms,
    )


def _shuffle_with_answer(correct: Any, wrong: list[Any], seed: str) -> tuple[list[Any], int]:
    options = [correct, *wrong[:WRONG_PER_QUESTION]]
    random.Random(seed).shuffle(options)
    return options, options.index(correct)


def _pick_example(card: FlashcardResponse) -> Example | None:
    easy = next((u for u in card.use_cases if u.speech_register == "easy"), None)
    chosen = easy or (card.use_cases[0] if card.use_cases else None)
    if not chosen:
        return None
    return Example(japanese=chosen.japanese, reading=chosen.reading, english=chosen.english)


def build_cloze(card: FlashcardResponse) -> Example | None:
    """Find a use_case whose Japanese contains card.kanji and blank out that word."""
    target = card.kanji.strip()
    if not target:
        return None
    ordered = sorted(card.use_cases, key=lambda u: 0 if u.speech_register == "easy" else 1)
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


def _photo_layer(card: FlashcardResponse, stage: ReviewStage, area: str) -> PhotoLayer | None:
    fmt = capture_format(card)
    has_photo = can_fill_gap(card)
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
    has_photo = can_fill_gap(card)
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
    """Build the staged exercise (flashcard, MCQ, or fill-in-the-blank) for a card."""
    exercise_id = f"{session_id}-{position}"
    area = area_of(card)
    seed = f"{session_id}:{card.flashcard_id}:{position}"
    stage = effective_stage(card)
    qtype = pick_question_type(card, seed)
    photo = _photo_layer(card, stage, area)
    example = _pick_example(card)
    place_hint = f"You saved this at {area}." if area else "No place saved for this one."
    next_step = _next_step_text(card)
    promoted_to, demoted_to = _stage_transitions(card, stage)
    jp_prompt = JpOption(text=card.kanji, reading=card.reading, romaji=card.romaji)

    if distractors.synonyms and not card.meaning_synonyms:
        card = card.model_copy(update={"meaning_synonyms": list(distractors.synonyms)})

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
            options, answer = _shuffle_with_answer(card.reading, distractors.readings, seed)
            prompt_kind: Literal["jp", "meaning", "photo"] = "jp"
        elif qtype == "mcq_text_translate":
            options, answer = _shuffle_with_answer(card.meaning, distractors.meanings, seed)
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


def order_session_cards(cards: list[FlashcardResponse]) -> list[FlashcardResponse]:
    """Order session cards easiest to hardest: flashcard -> mcq_photo -> mcq -> fill."""
    return sorted(cards, key=lambda c: STAGE_ORDER[effective_stage(c)])


def exercise_types_summary(cards: list[FlashcardResponse]) -> list[ExerciseType]:
    """Summary of exercise stages and how many of the user's Tango are at each stage."""
    counts: Counter[str] = Counter()
    for c in cards:
        stage = effective_stage(c)
        bucket = "mcq" if stage in ("mcq_photo", "mcq") else stage
        counts[bucket] += 1
    return [
        ExerciseType(id="flashcard", label="Flashcard", enabled=True, count=counts["flashcard"]),
        ExerciseType(id="mcq", label="Multiple choice", enabled=True, count=counts["mcq"]),
        ExerciseType(id="fill", label="Fill in the blank", enabled=True, count=counts["fill"]),
    ]


def areas_summary(cards: list[FlashcardResponse]) -> list[AreaCount]:
    """Card counts per area, most first. Cards without a named place are left out."""
    counts = Counter(area for area in (area_of(c) for c in cards) if area)
    return [AreaCount(area=a, count=n) for a, n in counts.most_common()]


def biggest_win(answers: list[SessionAnswer]) -> BiggestWin | None:
    """The correct answer that moved a card the most (reaching a star beats everything)."""
    correct = [a for a in answers if a.correct and a.strength_after > a.strength_before]
    if not correct:
        return None
    best = max(
        correct,
        key=lambda a: (
            a.strength_after >= MAX_STRENGTH,
            a.strength_after - a.strength_before,
            a.strength_after,
        ),
    )
    if best.strength_after >= MAX_STRENGTH:
        title, detail = "is now a star", "Full strength. It's a star on your map now."
    else:
        left = MAX_STRENGTH - best.strength_after
        title = "is getting stronger"
        detail = f"Strength {best.strength_after} of {MAX_STRENGTH}. {left} more to make it a star."
    return BiggestWin(
        flashcard_id=best.flashcard_id,
        tango=JpOption(text=best.text, reading=best.reading, romaji=best.romaji),
        meaning=best.meaning,
        title=title,
        detail=detail,
    )


def answered_by_area(answers: list[SessionAnswer]) -> list[AreaCount]:
    """Distinct cards practiced per area."""
    seen: dict[str, str] = {}
    for a in answers:
        seen[a.flashcard_id] = a.area
    counts = Counter(area for area in seen.values() if area)
    return [AreaCount(area=a, count=n) for a, n in counts.most_common()]


def session_minutes(started_at: datetime, answers: list[SessionAnswer]) -> int:
    if not answers:
        return 0
    last = max(_aware(a.at) for a in answers)
    return max(1, math.ceil((last - _aware(started_at)).total_seconds() / 60))
