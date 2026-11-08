from typing import Literal

from pydantic import BaseModel, Field


class UserProfile(BaseModel):
    """GET /me: who the token belongs to (claims only)."""

    uid: str
    # Plain str: Firebase already validated it, and EmailStr rejects emulator/test domains.
    email: str | None = None
    name: str | None = None
    picture: str | None = None
    email_verified: bool = False


ReadingLevel = Literal["none", "kana", "some_kanji", "most"]


class HomeArea(BaseModel):
    """Where the user lives. Pins inside it are never placed (privacy promise)."""

    label: str = Field(min_length=1, max_length=60)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    radius_m: int = Field(default=500, ge=100, le=3000)


class ProfileStats(BaseModel):
    tango: int
    stars: int
    places: int


class ProfileResponse(BaseModel):
    """GET /me/profile: what the Me tab shows."""

    uid: str
    name: str
    level_note: str
    reading_level: ReadingLevel | None = None
    home_area: HomeArea | None = None
    stats: ProfileStats


class ProfileUpdateRequest(BaseModel):
    """PUT /me/profile. Only the fields sent are changed."""

    name: str | None = Field(default=None, min_length=1, max_length=40)
    reading_level: ReadingLevel | None = None
    home_area: HomeArea | None = None
