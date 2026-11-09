"""What one review answer does to a card: grade, rating, strength, schedule, stage, history."""

from dataclasses import dataclass
from datetime import datetime

from app.schemas.flashcard import FlashcardResponse, HistoryEvent
from app.schemas.review import (
    ExerciseKey,
    FlipAnswer,
    PickAnswer,
    RevealAnswer,
    SessionAnswerRequest,
    TypedAnswer,
)
from app.schemas.review_types import QuestionType, Rating, ReviewStats
from app.services import tango_rules
from app.services.review_rules.cards import (
    capture_format,
    card_has_photo,
    effective_stage,
)
from app.services.review_rules.grading import (
    check_typed_answer,
    grade_answer,
    rating_for_answer,
)
from app.services.review_rules.question_types import QUESTIONS, Family
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


# Which answer kinds fit which question family.
ANSWER_KIND_FAMILIES: dict[str, frozenset[Family]] = {
    "flip": frozenset({"flashcard"}),
    "pick": frozenset({"mcq"}),
    "typed": frozenset({"fill"}),
    "reveal": frozenset({"fill"}),
}


def answer_fits(key: ExerciseKey, answer: SessionAnswerRequest) -> bool:
    """Whether the answer kind is one this question can get (e.g. no "pick" for fill)."""
    return QUESTIONS[key.question_type].family in ANSWER_KIND_FAMILIES[answer.kind]


def grade_against_key(
    key: ExerciseKey, answer: SessionAnswerRequest
) -> tuple[bool, Rating | None]:
    """Whether a session answer is right, graded against the question as it was asked.

    Returns the learner's own rating too (flashcards only).
    """
    match answer:
        case FlipAnswer():
            return answer.rating != "again", answer.rating
        case PickAnswer():
            return answer.index == key.answer_index, None
        case TypedAnswer():
            return check_typed_answer(
                key.question_type, answer.text, key.accepted_answers
            ), None
        case RevealAnswer():
            return False, None


def apply_answer(
    card: FlashcardResponse,
    now: datetime,
    *,
    rating: Rating | None,
    correct: bool | None,
    answer_text: str | None,
    question_type: QuestionType | None,
) -> AnswerOutcome:
    """Work out the card's new review state from one answer, graded against the card.

    Pure: nothing is saved. Used by POST /flashcards/{id}/review.
    """
    is_correct = grade_answer(card, question_type, correct, rating, answer_text)
    stale = is_stale_answer(card, question_type)
    return _outcome(card, now, is_correct, rating, question_type, stale=stale)


def apply_session_answer(
    card: FlashcardResponse,
    key: ExerciseKey,
    answer: SessionAnswerRequest,
    now: datetime,
) -> AnswerOutcome:
    """Work out the card's new review state from one session answer, graded against the
    stored question. Stale when the card's stage changed since the question was built.

    Pure: nothing is saved. Used by POST /review/session/{id}/answers.
    """
    is_correct, rating = grade_against_key(key, answer)
    stale = effective_stage(card) != key.stage
    return _outcome(card, now, is_correct, rating, key.question_type, stale=stale)


def _outcome(
    card: FlashcardResponse,
    now: datetime,
    is_correct: bool,
    rating: Rating | None,
    question_type: QuestionType | None,
    *,
    stale: bool,
) -> AnswerOutcome:
    if stale:
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
