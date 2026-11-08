from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.schemas.flashcard import FlashcardResponse, JpOption


class ReviewCardResponse(BaseModel):
    """Small review card on the Today screen."""

    due_count: int
    minutes: int
    areas: list[str]
    sample: list[FlashcardResponse]
    more_count: int


class Collection(BaseModel):
    id: str
    label: str
    count: int
    is_place: bool
    is_place_cue: bool


class ExerciseType(BaseModel):
    id: str
    label: str
    enabled: bool


class ReviewSummaryResponse(BaseModel):
    """Review tab: due cards, collections and exercise types."""

    due_count: int
    minutes: int
    place_cue_count: int
    collections: list[Collection]
    exercise_types: list[ExerciseType]
    total_tango: int


class GapBox(BaseModel):
    """Normalized rectangle (0-1) over the photo."""

    x: float
    y: float
    w: float
    h: float


class Example(BaseModel):
    japanese: str
    reading: str
    english: str


class MultipleChoiceExercise(BaseModel):
    id: str
    type: Literal["multiple_choice"] = "multiple_choice"
    flashcard_id: str
    prompt: JpOption
    options: list[str]
    answer_index: int
    place_hint: str
    example: Example | None = None
    next_step: str


class FillGapExercise(BaseModel):
    id: str
    type: Literal["fill_gap"] = "fill_gap"
    flashcard_id: str
    image_url: str
    caption: str
    gap: GapBox
    options: list[JpOption]
    answer_index: int
    note: str


Exercise = Annotated[MultipleChoiceExercise | FillGapExercise, Field(discriminator="type")]


class ReviewSessionResponse(BaseModel):
    session_id: str
    exercises: list[Exercise]


class SessionAnswer(BaseModel):
    """One answer, with a snapshot of the card so results need no extra reads."""

    flashcard_id: str
    correct: bool
    strength_before: int
    strength_after: int
    at: datetime
    text: str
    reading: str = ""
    romaji: str = ""
    meaning: str = ""
    area: str = ""


class ReviewSessionRecord(BaseModel):
    """Stored in users/{uid}/review_sessions/{session_id}."""

    session_id: str
    flashcard_ids: list[str]
    collection: str | None = None
    started_at: datetime
    answers: list[SessionAnswer] = Field(default_factory=list)


class AreaCount(BaseModel):
    area: str
    count: int


class BiggestWin(BaseModel):
    flashcard_id: str
    tango: JpOption
    meaning: str
    title: str
    detail: str


class SessionResultResponse(BaseModel):
    reviewed: int
    minutes: int
    biggest_win: BiggestWin | None = None
    by_area: list[AreaCount]
    # Next planned visit; filled in once visits exist (P4).
    next: None = None
