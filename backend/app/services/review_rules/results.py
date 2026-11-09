"""Summaries for the Review tab and the session results screen."""

import math
from collections import Counter
from datetime import datetime

from app.schemas.flashcard import (
    FlashcardResponse,
    JpOption,
)
from app.schemas.review import (
    AreaCount,
    BiggestWin,
    ExerciseType,
    SessionAnswer,
)
from app.services.review_rules.cards import effective_stage
from app.services.review_rules.selection import _aware, area_of
from app.services.tango_rules import MAX_STRENGTH


def exercise_types_summary(cards: list[FlashcardResponse]) -> list[ExerciseType]:
    """Summary of exercise stages and how many of the user's Tango are at each stage."""
    counts: Counter[str] = Counter()
    for c in cards:
        stage = effective_stage(c)
        bucket = "mcq" if stage in ("mcq_photo", "mcq") else stage
        counts[bucket] += 1
    return [
        ExerciseType(
            id="flashcard", label="Flashcard", enabled=True, count=counts["flashcard"]
        ),
        ExerciseType(
            id="mcq", label="Multiple choice", enabled=True, count=counts["mcq"]
        ),
        ExerciseType(
            id="fill", label="Fill in the blank", enabled=True, count=counts["fill"]
        ),
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
