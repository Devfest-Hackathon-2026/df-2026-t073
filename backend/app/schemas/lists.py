from datetime import datetime

from pydantic import BaseModel, Field


class TangoList(BaseModel):
    """A user-made review list, stored at users/{uid}/lists/{list_id}."""

    list_id: str
    name: str
    # Flashcard ids, in the order they were added.
    tango_ids: list[str] = Field(default_factory=list)
    created_at: datetime


class ListCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    tango_ids: list[str] = Field(default_factory=list)


class ListUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    add: list[str] = Field(default_factory=list)
    remove: list[str] = Field(default_factory=list)


class FlashcardUpdateRequest(BaseModel):
    favorite: bool | None = None
