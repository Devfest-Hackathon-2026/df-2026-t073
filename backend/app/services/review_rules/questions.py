"""Which question a card gets, and whether an answer still fits the card's stage."""

import random

from app.schemas.flashcard import (
    FlashcardResponse,
    QuestionType,
)
from app.services.review_rules.cards import effective_stage, uses_object_questions
from app.services.review_rules.grading import is_kana_only
from app.services.review_rules.question_types import QUESTIONS


def is_stale_answer(
    card: FlashcardResponse, question_type: QuestionType | None
) -> bool:
    """True when the question no longer fits the card's stage (e.g. an old session's
    exercise after the card moved on). Such answers are not counted."""
    return (
        question_type is not None
        and effective_stage(card) not in QUESTIONS[question_type].stages
    )


def pick_question_type(card: FlashcardResponse, seed: str = "") -> QuestionType:
    """Pick the question type for a card's stage and format, rotating away from last_question_type."""
    stage = effective_stage(card)
    object_card = uses_object_questions(card)
    kana_only = is_kana_only(card)
    candidates: list[QuestionType] = [
        qtype
        for qtype, spec in QUESTIONS.items()
        if stage in spec.stages
        and spec.object_question == object_card
        and not (spec.asks_reading and kana_only)
    ]

    last = card.review_stats.last_question_type
    if len(candidates) > 1 and last in candidates:
        candidates = [c for c in candidates if c != last]

    if not seed:
        return candidates[0]
    return random.Random(seed).choice(candidates)
