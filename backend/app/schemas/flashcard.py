from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.capture import Vertex


class UseCaseExample(BaseModel):
    japanese: str
    reading: str
    english: str


class GeneratedFlashcardContent(BaseModel):
    kanji: str
    reading: str
    romaji: str
    meaning: str
    part_of_speech: str
    use_cases: list[UseCaseExample]


class RelatedVocabItem(BaseModel):
    kanji: str
    reading: str
    meaning: str
    relation_note: str


class ReviewStats(BaseModel):
    review_count: int = 0
    last_reviewed_at: datetime | None = None
    next_review_at: datetime
    mastered: bool = False


class FlashcardCreateRequest(BaseModel):
    capture_id: str
    item_id: str | None = None
    selected_text: str | None = None

    @model_validator(mode="after")
    def validate_selection(self) -> "FlashcardCreateRequest":
        if not self.item_id and (not self.selected_text or not self.selected_text.strip()):
            raise ValueError("Either item_id or selected_text must be provided.")
        return self


class FlashcardReviewRequest(BaseModel):
    rating: Literal["again", "good", "easy"]


class FlashcardResponse(GeneratedFlashcardContent):
    flashcard_id: str
    capture_id: str
    item_id: str | None = None
    image_url: str
    bounding_box: list[Vertex] = Field(default_factory=list)
    related_vocab: list[RelatedVocabItem] = Field(default_factory=list)
    review_stats: ReviewStats
    created_at: datetime

