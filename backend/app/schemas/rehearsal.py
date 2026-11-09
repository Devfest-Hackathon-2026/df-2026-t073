from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.place import JpName, Place

Speed = Literal["slower", "natural"]


class Suggestion(BaseModel):
    jp: JpName
    why: str


class ReplyChoice(BaseModel):
    """One of three replies offered when the user can't speak."""

    jp: JpName
    en: str
    ok: bool
    label: str  # e.g. "Natural and polite"
    note: str
    suggestion: Suggestion | None = None


class RehearsalTurn(BaseModel):
    id: str
    speaker: Literal["staff", "user"]
    jp: JpName
    en: str
    # User turns only.
    hint: str | None = None
    choices: list[ReplyChoice] = Field(default_factory=list)


class RehearsalScript(BaseModel):
    """Written once per place and language by Gemini (cached, shared)."""

    staff_voice: str = "Staff"
    turns: list[RehearsalTurn]
    generated_at: datetime | None = None


class RehearsalStartRequest(BaseModel):
    place_id: str = Field(min_length=1)
    language: str = "English"


class RehearsalStartResponse(BaseModel):
    rehearsal_id: str
    place: Place
    staff_voice: str
    turns: list[RehearsalTurn]


class TurnAnswerRequest(BaseModel):
    """Either a spoken reply (audio) or one of the offered choices."""

    choice_index: int | None = Field(default=None, ge=0, le=2)
    audio_base64: str | None = None
    mime_type: str = "audio/aac"

    @model_validator(mode="after")
    def one_of(self) -> "TurnAnswerRequest":
        if (self.choice_index is None) == (not self.audio_base64):
            raise ValueError("Send exactly one of choice_index or audio_base64.")
        return self


class TurnResult(BaseModel):
    """How a reply was rated. Stored per turn; the results screen reads these."""

    turn_id: str
    staff: JpName
    said: JpName
    spoken: bool
    ok: bool
    label: str
    note: str
    suggestion: Suggestion | None = None


class RehearsalSession(BaseModel):
    """users/{uid}/rehearsals/{id}"""

    rehearsal_id: str
    place: Place
    language: str
    turns: list[RehearsalTurn]
    started_at: datetime
    answers: dict[str, TurnResult] = Field(default_factory=dict)


class SentenceTango(BaseModel):
    """One of the user's Tango that appears in a sentence."""

    flashcard_id: str
    text: str


class ResultLine(TurnResult):
    """A result line, with the user's Tango that each version of it contains."""

    said_tango: list[SentenceTango] = Field(default_factory=list)
    suggestion_tango: list[SentenceTango] = Field(default_factory=list)


class RehearsalResult(BaseModel):
    place: Place
    lines: list[ResultLine]


class SaveSentenceRequest(BaseModel):
    # False: what the user said. True: Gemini's suggested version.
    use_suggestion: bool = False


class SaveSentenceResponse(BaseModel):
    """The Tango the sentence was saved to (already-saved ones included)."""

    saved_to: list[SentenceTango]


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    speed: Speed = "natural"


class TtsResponse(BaseModel):
    audio_url: str
