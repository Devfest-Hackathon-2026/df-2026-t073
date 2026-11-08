"""Pure rules for review sessions: which cards, which questions, what the results say.

No I/O here, so these are unit-tested directly (tests/test_review_rules.py).
"""

import math
import random
from collections import Counter
from datetime import datetime, timezone

from app.schemas.capture import Vertex
from app.schemas.flashcard import Distractors, FlashcardResponse, JpOption
from app.schemas.review import (
    AreaCount,
    BiggestWin,
    Example,
    FillGapExercise,
    GapBox,
    MultipleChoiceExercise,
    SessionAnswer,
)
from app.services.tango_rules import MAX_STRENGTH

SESSION_SIZE = 10
SECONDS_PER_CARD = 20
OPTIONS_PER_QUESTION = 4
WRONG_PER_QUESTION = OPTIONS_PER_QUESTION - 1
PLACE_CUE_COLLECTION = "place-cue"
PLACE_PREFIX = "place:"
AREA_PREFIX = "area:"
# Padding around a detected item so the whole word is hidden, in normalized units.
GAP_PADDING = 0.02

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


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def is_due(card: FlashcardResponse, now: datetime) -> bool:
    return _aware(card.review_stats.next_review_at) <= now


def area_of(card: FlashcardResponse) -> str:
    """The place this Tango was most recently found, or "" if none was named."""
    named = [s for s in card.sightings if s.place_name]
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
) -> bool:
    if not collection:
        return True
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
) -> list[FlashcardResponse]:
    """Weakest due cards first.

    Without a collection, only due cards. With a collection (the user chose
    "Review these"), not-yet-due cards fill the rest so practice is always possible.
    """
    chosen = [c for c in cards if in_collection(c, collection, area_by_place)]
    due = [c for c in chosen if is_due(c, now)]
    due.sort(key=lambda c: (c.strength, _aware(c.review_stats.next_review_at)))
    if not collection:
        return due[:limit]
    rest = [c for c in chosen if not is_due(c, now)]
    rest.sort(key=lambda c: (c.strength, _aware(c.review_stats.next_review_at)))
    return (due + rest)[:limit]


def can_fill_gap(card: FlashcardResponse) -> bool:
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


def _unique(items: list[str], exclude: set[str]) -> list[str]:
    seen = set(exclude)
    out: list[str] = []
    for item in items:
        key = item.strip().lower()
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
    user's other cards, then a built-in list."""
    found = found or Distractors()
    meanings = _unique(
        [*found.meanings, *(o.meaning for o in others if o.flashcard_id != card.flashcard_id), *FALLBACK_MEANINGS],
        exclude={card.meaning.strip().lower()},
    )[:WRONG_PER_QUESTION]

    word_pool = [
        *found.words,
        *(
            JpOption(text=o.kanji, reading=o.reading, romaji=o.romaji)
            for o in others
            if o.flashcard_id != card.flashcard_id
        ),
        *FALLBACK_WORDS,
    ]
    seen = {card.kanji.strip()}
    words: list[JpOption] = []
    for word in word_pool:
        if word.text.strip() and word.text.strip() not in seen:
            seen.add(word.text.strip())
            words.append(word)
        if len(words) == WRONG_PER_QUESTION:
            break
    return Distractors(meanings=meanings, words=words)


def _shuffle_with_answer(correct: object, wrong: list, seed: str) -> tuple[list, int]:
    options = [correct, *wrong[:WRONG_PER_QUESTION]]
    random.Random(seed).shuffle(options)
    return options, options.index(correct)


def build_exercise(
    card: FlashcardResponse,
    distractors: Distractors,
    position: int,
    session_id: str,
) -> MultipleChoiceExercise | FillGapExercise:
    """Fill-the-gap on the user's photo for every other eligible card, else multiple choice."""
    exercise_id = f"{session_id}-{position}"
    area = area_of(card)
    seed = f"{session_id}:{card.flashcard_id}"

    if can_fill_gap(card) and position % 2 == 0:
        correct = JpOption(text=card.kanji, reading=card.reading, romaji=card.romaji)
        options, answer = _shuffle_with_answer(correct, distractors.words, seed)
        return FillGapExercise(
            id=exercise_id,
            flashcard_id=card.flashcard_id,
            image_url=card.image_url,
            caption=f"Your photo · {area}" if area else "Your photo",
            gap=gap_from_bbox(card.bounding_box),
            options=options,
            answer_index=answer,
            note="Wrong choices are look-alikes picked by Gemini.",
        )

    options, answer = _shuffle_with_answer(card.meaning, distractors.meanings, seed)
    easy = next((u for u in card.use_cases if u.speech_register == "easy"), None)
    example = easy or (card.use_cases[0] if card.use_cases else None)
    steps_left = MAX_STRENGTH - card.strength
    return MultipleChoiceExercise(
        id=exercise_id,
        flashcard_id=card.flashcard_id,
        prompt=JpOption(text=card.kanji, reading=card.reading, romaji=card.romaji),
        options=options,
        answer_index=answer,
        place_hint=f"You saved this at {area}." if area else "No place saved for this one.",
        example=Example(japanese=example.japanese, reading=example.reading, english=example.english)
        if example
        else None,
        next_step=(
            f"{steps_left} more step{'s' if steps_left != 1 else ''} until it's a star on your map."
            if steps_left > 0
            else "It's already a star on your map."
        ),
    )


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
