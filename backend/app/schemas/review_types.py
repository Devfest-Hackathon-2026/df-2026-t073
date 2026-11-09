"""Review types shared by the schemas and the review rules.

A leaf module: it imports nothing from the app, so the stage rules
(app/services/review_rules/stages.py) and the flashcard schema can both use it
without importing each other.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

CaptureFormat = Literal["object", "text"]
ReviewStage = Literal["flashcard", "mcq_photo", "mcq", "fill"]
QuestionType = Literal[
    "flashcard_text",
    "flashcard_object",
    "mcq_text_reading",
    "mcq_text_translate",
    "mcq_text_reverse",
    "mcq_object_name",
    "fill_text_reading",
    "fill_text_translate",
    "fill_text_reverse",
    "fill_object_name",
]
Rating = Literal["again", "good", "easy"]


class ReviewStats(BaseModel):
    review_count: int = 0
    last_reviewed_at: datetime | None = None
    next_review_at: datetime
    mastered: bool = False
    stage: ReviewStage | None = None
    stage_streak: int = 0
    miss_streak: int = 0
    last_question_type: QuestionType | None = None
