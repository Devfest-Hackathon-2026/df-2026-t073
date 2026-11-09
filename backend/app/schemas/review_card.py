"""Shared review summary shown on Today and review screens."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.flashcard import FlashcardResponse


class ReviewCardResponse(BaseModel):
    due_count: int
    minutes: int
    areas: list[str] = Field(default_factory=list)
    sample: list[FlashcardResponse] = Field(default_factory=list)
    more_count: int = 0
    # When nothing is due: when the next Tango will be.
    next_due_at: datetime | None = None
