from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.capture import Vertex

TangoKind = Literal["word", "phrase", "object", "menu_item"]
Register = Literal["easy", "keigo"]


class UseCaseExample(BaseModel):
    # "register" is the JSON/Firestore name; the Python name avoids shadowing
    # BaseModel.register.
    model_config = ConfigDict(validate_by_name=True, validate_by_alias=True, serialize_by_alias=True)

    japanese: str
    reading: str
    english: str
    # Old cards have no register; treat them as the easy version.
    speech_register: Register = Field(default="easy", alias="register")


class GeneratedFlashcardContent(BaseModel):
    kanji: str
    reading: str
    romaji: str
    meaning: str
    part_of_speech: str
    # Older generator output had no kind.
    kind: TangoKind = "word"
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


class Sighting(BaseModel):
    """One place and time the Tango was found."""

    sighting_id: str
    capture_id: str | None = None
    place_id: str | None = None
    place_name: str = ""
    lat: float | None = None
    lng: float | None = None
    seen_at: datetime
    image_url: str | None = None


class HistoryEvent(BaseModel):
    """One step in "How it grew" on the Tango detail screen."""

    type: Literal["caught", "reviewed", "seen_again"]
    at: datetime
    detail: str = ""
    # Links caught/seen_again events to their sighting, so Undo can remove both.
    sighting_id: str | None = None
    strength_after: int = 0


class FlashcardCreateRequest(BaseModel):
    capture_id: str
    item_id: str | None = None
    selected_text: str | None = None
    # Where the Tango was caught (A2). Falls back to the capture's stored place.
    place_id: str | None = None
    place_name: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    # Language for meanings and examples' translations.
    language: str = "English"

    @model_validator(mode="after")
    def validate_selection(self) -> "FlashcardCreateRequest":
        if not self.item_id and (not self.selected_text or not self.selected_text.strip()):
            raise ValueError("Either item_id or selected_text must be provided.")
        return self


class FlashcardReviewRequest(BaseModel):
    rating: Literal["again", "good", "easy"]
    # Set when the answer comes from a review session, so the result screen can use it.
    session_id: str | None = None


class JpOption(BaseModel):
    """A Japanese word as an answer choice."""

    text: str
    reading: str = ""
    romaji: str = ""


class Distractors(BaseModel):
    """Plausible wrong answers for review questions, cached on the card."""

    meanings: list[str] = Field(default_factory=list)
    words: list[JpOption] = Field(default_factory=list)


class SightingCreateRequest(BaseModel):
    """Seen again in the camera (B1)."""

    capture_id: str | None = None
    place_id: str | None = None
    place_name: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    recognized: bool = True


class FlashcardResponse(GeneratedFlashcardContent):
    flashcard_id: str
    # First capture of this Tango (kept for older clients).
    capture_id: str
    item_id: str | None = None
    image_url: str
    bounding_box: list[Vertex] = Field(default_factory=list)
    related_vocab: list[RelatedVocabItem] = Field(default_factory=list)
    review_stats: ReviewStats
    created_at: datetime
    # 0-4; 4 is a star on the map.
    strength: int = Field(default=0, ge=0, le=4)
    sightings: list[Sighting] = Field(default_factory=list)
    history: list[HistoryEvent] = Field(default_factory=list)
    # Filled on first review; reused by later sessions.
    distractors: Distractors | None = None


class FlashcardCatchResponse(BaseModel):
    """Result of catching a Tango: the card, whether it is new, and the sighting to undo."""

    card: FlashcardResponse
    created: bool
    sighting_id: str
