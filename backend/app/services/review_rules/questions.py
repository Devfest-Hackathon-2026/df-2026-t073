"""Which question a card gets, and which stages each question type belongs to."""

import random

from app.schemas.flashcard import (
    FlashcardResponse,
    QuestionType,
    ReviewStage,
)
from app.services.review_rules.cards import effective_stage, uses_object_questions
from app.services.review_rules.grading import is_kana_only

# Which stages each question type is asked at. An answer to a question that doesn't
# match the card's current stage (a stale exercise) doesn't move the stage.
QUESTION_STAGES: dict[QuestionType, frozenset[ReviewStage]] = {
    "flashcard_text": frozenset({"flashcard"}),
    "flashcard_object": frozenset({"flashcard"}),
    "mcq_text_reading": frozenset({"mcq"}),
    "mcq_text_translate": frozenset({"mcq_photo", "mcq"}),
    "mcq_text_reverse": frozenset({"mcq"}),
    "mcq_object_name": frozenset({"mcq"}),
    "fill_text_reading": frozenset({"fill"}),
    "fill_text_translate": frozenset({"fill"}),
    "fill_text_reverse": frozenset({"fill"}),
    "fill_object_name": frozenset({"fill"}),
}


def is_stale_answer(
    card: FlashcardResponse, question_type: QuestionType | None
) -> bool:
    """True when the question no longer fits the card's stage (e.g. an old session's
    exercise after the card moved on). Such answers are not counted."""
    return (
        question_type is not None
        and effective_stage(card) not in QUESTION_STAGES[question_type]
    )


def pick_question_type(card: FlashcardResponse, seed: str = "") -> QuestionType:
    """Pick the question type for a card's stage and format, rotating away from last_question_type."""
    stage = effective_stage(card)

    if uses_object_questions(card):
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
