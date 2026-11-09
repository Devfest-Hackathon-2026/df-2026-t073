"""The question types and what each one is. Adding a question type starts here.

A leaf module (imports only app.schemas.review_types), so the request schemas can use it
without a circular import.
"""

from dataclasses import dataclass
from typing import Literal

from app.schemas.review_types import QuestionType, Rating, ReviewStage

type Family = Literal["flashcard", "mcq", "fill"]
type AnswerKind = Literal["kana", "meaning"]


@dataclass(frozen=True, slots=True)
class QuestionSpec:
    family: Family
    # Stages the question is asked at. An answer to a question that doesn't match the
    # card's current stage (a stale exercise) is not counted.
    stages: frozenset[ReviewStage]
    # Uses the capture photo as the prompt; only for object cards that have a photo.
    object_question: bool = False
    # Tests the reading, so it is skipped for words written only in kana.
    asks_reading: bool = False
    # What the learner types (fill-in-the-blank only).
    answer_kind: AnswerKind | None = None


_FLASHCARD = frozenset[ReviewStage]({"flashcard"})
_MCQ = frozenset[ReviewStage]({"mcq"})
_FILL = frozenset[ReviewStage]({"fill"})

# Order matters: pick_question_type chooses among a stage's candidates in this order.
QUESTIONS: dict[QuestionType, QuestionSpec] = {
    "flashcard_text": QuestionSpec("flashcard", _FLASHCARD),
    "flashcard_object": QuestionSpec("flashcard", _FLASHCARD, object_question=True),
    "mcq_text_reading": QuestionSpec("mcq", _MCQ, asks_reading=True),
    "mcq_text_translate": QuestionSpec("mcq", frozenset({"mcq_photo", "mcq"})),
    "mcq_text_reverse": QuestionSpec("mcq", _MCQ),
    "mcq_object_name": QuestionSpec("mcq", _MCQ, object_question=True),
    "fill_text_reading": QuestionSpec(
        "fill", _FILL, asks_reading=True, answer_kind="kana"
    ),
    "fill_text_translate": QuestionSpec("fill", _FILL, answer_kind="meaning"),
    "fill_text_reverse": QuestionSpec("fill", _FILL, answer_kind="kana"),
    "fill_object_name": QuestionSpec(
        "fill", _FILL, object_question=True, answer_kind="kana"
    ),
}

# The rating a right answer gets. None: the learner rates the flashcard themselves.
RATING_WHEN_CORRECT: dict[Family, Rating | None] = {
    "flashcard": None,
    "mcq": "good",
    "fill": "easy",
}


def family_of(question_type: QuestionType | None) -> Family | None:
    return QUESTIONS[question_type].family if question_type else None
