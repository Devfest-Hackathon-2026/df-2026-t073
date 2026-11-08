from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.capture import Vertex

TangoKind = Literal["word", "phrase", "object", "menu_item"]
Register = Literal["easy", "keigo"]
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
    stage: ReviewStage | None = None
    stage_streak: int = 0
    miss_streak: int = 0
    last_question_type: QuestionType | None = None


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
    # None for a live camera catch (read on the phone, no photo uploaded).
    capture_id: str | None = None
    item_id: str | None = None
    selected_text: str | None = None
    # Where the Tango was caught (A2). Falls back to the capture's stored place.
    place_id: str | None = None
    place_name: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    # Language for meanings and examples' translations.
    language: str = "English"
    # When True (saving a word seen inside the app, not the camera), an existing
    # card is returned as-is instead of recording a new camera sighting.
    only_if_new: bool = False

    @model_validator(mode="after")
    def validate_selection(self) -> "FlashcardCreateRequest":
        has_text = bool(self.selected_text and self.selected_text.strip())
        if not self.item_id and not has_text:
            raise ValueError("Either item_id or selected_text must be provided.")
        if not self.capture_id and not has_text:
            raise ValueError("selected_text is required when there is no capture_id.")
        return self


class FlashcardReviewRequest(BaseModel):
    rating: Literal["again", "good", "easy"] | None = None
    correct: bool | None = None
    answer: str | None = None
    question_type: QuestionType | None = None
    # Set when the answer comes from a review session, so the result screen can use it.
    session_id: str | None = None

    @model_validator(mode="after")
    def validate_outcome(self) -> "FlashcardReviewRequest":
        if self.rating is None and self.correct is None and self.answer is None:
            raise ValueError("One of rating, correct, or answer must be provided.")
        return self


class JpOption(BaseModel):
    """A Japanese word as an answer choice."""

    text: str
    reading: str = ""
    romaji: str = ""


class Distractors(BaseModel):
    """Plausible wrong answers for review questions, cached on the card."""

    meanings: list[str] = Field(default_factory=list)
    words: list[JpOption] = Field(default_factory=list)
    readings: list[str] = Field(default_factory=list)
    synonyms: list[str] = Field(default_factory=list)


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
    meaning_synonyms: list[str] = Field(default_factory=list)
    # Whether the Tango came from Vision object recognition ("object") or OCR ("text").
    capture_format: CaptureFormat | None = None
    # Marked by the user; reviewable as the "favorites" collection.
    favorite: bool = False

    @model_validator(mode="after")
    def populate_defaults(self) -> "FlashcardResponse":
        if self.capture_format is None:
            self.capture_format = "object" if self.kind == "object" else "text"
        has_photo = bool(self.image_url) and len(self.bounding_box) >= 2
        if self.review_stats.stage is None:
            if self.strength <= 1:
                inferred: ReviewStage = "flashcard"
            elif self.strength == 2:
                inferred = "mcq_photo" if (self.capture_format == "text" and has_photo) else "mcq"
            elif self.strength == 3:
                inferred = "mcq"
            else:
                inferred = "fill"
            self.review_stats = self.review_stats.model_copy(update={"stage": inferred})
        elif self.review_stats.stage == "mcq_photo" and (
            self.capture_format == "object" or not has_photo
        ):
            self.review_stats = self.review_stats.model_copy(update={"stage": "mcq"})
        if not self.meaning_synonyms and self.distractors and self.distractors.synonyms:
            self.meaning_synonyms = list(self.distractors.synonyms)
        return self


class FlashcardCatchResponse(BaseModel):
    """Result of catching a Tango: the card, whether it is new, and the sighting to undo."""

    card: FlashcardResponse
    created: bool
    sighting_id: str
