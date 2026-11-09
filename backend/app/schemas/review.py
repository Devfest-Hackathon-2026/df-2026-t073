from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.schemas.flashcard import (
    CaptureFormat,
    FlashcardResponse,
    JpOption,
    QuestionType,
)
from app.schemas.review_types import ReviewStage


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
    is_favorites: bool = False
    # A user-made list (id "list:<list_id>").
    is_list: bool = False


class ExerciseType(BaseModel):
    id: str
    label: str
    enabled: bool
    count: int = 0


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


class PhotoLayer(BaseModel):
    """Capture photo and highlight box for questions that show the photo."""

    image_url: str
    box: GapBox
    caption: str


class Example(BaseModel):
    japanese: str
    reading: str
    english: str


class FlashcardBack(BaseModel):
    text: str
    reading: str
    romaji: str
    meaning: str
    example: Example | None = None


class FlashcardExercise(BaseModel):
    id: str
    type: Literal["flashcard"] = "flashcard"
    question_type: Literal["flashcard_text", "flashcard_object"]
    stage: ReviewStage = "flashcard"
    flashcard_id: str
    photo: PhotoLayer | None = None
    front: JpOption | None = None
    back: FlashcardBack
    place_hint: str
    next_step: str
    promoted_to: ReviewStage | None = None
    demoted_to: ReviewStage | None = None


class McqExercise(BaseModel):
    id: str
    type: Literal["mcq"] = "mcq"
    question_type: Literal[
        "mcq_text_reading",
        "mcq_text_translate",
        "mcq_text_reverse",
        "mcq_object_name",
    ]
    stage: ReviewStage = "mcq"
    flashcard_id: str
    photo: PhotoLayer | None = None
    prompt_kind: Literal["jp", "meaning", "photo"]
    prompt: JpOption
    meaning_prompt: str = ""
    options: list[JpOption | str]
    answer_index: int
    place_hint: str
    example: Example | None = None
    next_step: str
    promoted_to: ReviewStage | None = None
    demoted_to: ReviewStage | None = None


class FillBlankExercise(BaseModel):
    id: str
    type: Literal["fill"] = "fill"
    question_type: Literal[
        "fill_text_reading",
        "fill_text_translate",
        "fill_text_reverse",
        "fill_object_name",
    ]
    stage: ReviewStage = "fill"
    flashcard_id: str
    photo: PhotoLayer | None = None
    prompt: JpOption
    meaning_prompt: str = ""
    cloze: Example | None = None
    answer_kind: Literal["kana", "meaning"]
    accepted_answers: list[str]
    answer_display: str
    place_hint: str = ""
    example: Example | None = None
    next_step: str = ""
    promoted_to: ReviewStage | None = None
    demoted_to: ReviewStage | None = None


Exercise = Annotated[
    FlashcardExercise | McqExercise | FillBlankExercise,
    Field(discriminator="type"),
]


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


class ExerciseKey(BaseModel):
    """How one question in a session is graded, saved when the session starts.

    Answers are graded against this, not against the card as it is when they arrive.
    """

    exercise_id: str
    flashcard_id: str
    question_type: QuestionType
    stage: ReviewStage
    # Multiple choice: the right option.
    answer_index: int | None = None
    # Fill-in-the-blank: what the learner types and which answers count.
    answer_kind: Literal["kana", "meaning"] | None = None
    accepted_answers: list[str] = Field(default_factory=list)


class ReviewSessionRecord(BaseModel):
    """Stored in users/{uid}/review_sessions/{session_id}."""

    session_id: str
    flashcard_ids: list[str]
    collection: str | None = None
    started_at: datetime
    answers: list[SessionAnswer] = Field(default_factory=list)
    # Empty for sessions saved before answer keys existed.
    exercises: list[ExerciseKey] = Field(default_factory=list)


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
