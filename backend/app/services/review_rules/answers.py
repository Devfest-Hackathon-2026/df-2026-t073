"""What one review answer does to a card: grade, rating, strength, schedule, stage, history."""

from dataclasses import dataclass
from datetime import datetime

from app.schemas.flashcard import FlashcardResponse, HistoryEvent
from app.schemas.review_types import QuestionType, Rating, ReviewStats
from app.services import tango_rules
from app.services.review_rules.cards import capture_format, card_has_photo
from app.services.review_rules.grading import grade_answer, rating_for_answer
from app.services.review_rules.questions import is_stale_answer
from app.services.review_rules.scheduling import next_review_stats
from app.services.review_rules.stages import next_stage


@dataclass(frozen=True, slots=True)
class AnswerOutcome:
    """The card's new review state after one answer.

    A stale answer (the question no longer fits the card's stage) is graded but not
    counted: stats and strength are the card's current ones and there is no event.
    """

    correct: bool
    stale: bool
    stats: ReviewStats
    strength: int
    event: HistoryEvent | None


def apply_answer(
    card: FlashcardResponse,
    now: datetime,
    *,
    rating: Rating | None,
    correct: bool | None,
    answer_text: str | None,
    question_type: QuestionType | None,
) -> AnswerOutcome:
    """Work out the card's new review state from one answer. Pure: nothing is saved."""
    is_correct = grade_answer(card, question_type, correct, rating, answer_text)
    if is_stale_answer(card, question_type):
        return AnswerOutcome(
            correct=is_correct,
            stale=True,
            stats=card.review_stats,
            strength=card.strength,
            event=None,
        )

    effective_rating = rating_for_answer(question_type, is_correct, rating)
    strength = tango_rules.apply_review(card.strength, effective_rating)
    scheduled_stats = next_review_stats(
        card.review_stats, effective_rating, now, strength
    )
    new_stats = next_stage(
        scheduled_stats,
        capture_format(card),
        is_correct,
        has_photo=card_has_photo(card),
        question_type=question_type,
    )
    event = tango_rules.history_event(
        now=now,
        type="reviewed",
        detail=question_type or effective_rating,
        strength_after=strength,
    )
    return AnswerOutcome(
        correct=is_correct,
        stale=False,
        stats=new_stats,
        strength=strength,
        event=event,
    )
