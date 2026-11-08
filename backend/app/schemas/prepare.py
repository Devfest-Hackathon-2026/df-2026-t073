from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.place import Place


class BriefingTango(BaseModel):
    """A word or phrase worth knowing before the visit."""

    text: str
    reading: str = ""
    romaji: str = ""
    meaning: str = ""
    # Set when the user already has this Tango, so the app can link to it.
    flashcard_id: str | None = None


class HistoryTip(BaseModel):
    """Anonymous tip from another learner: no user id, no exact time."""

    id: str
    quote: str
    learners: int = 1
    when: str = ""
    in_rehearsal: bool = False


class BriefingContent(BaseModel):
    """What Gemini writes once per place and language (cached, shared)."""

    steps: list[str] = Field(default_factory=list)
    tango: list[BriefingTango] = Field(default_factory=list)
    source: str = ""
    generated_at: datetime | None = None


class BriefingResponse(BaseModel):
    place: Place
    steps: list[str]
    tango: list[BriefingTango]
    tips: list[HistoryTip]
    source: str
