from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.flashcard import FlashcardResponse


class JpName(BaseModel):
    """A place name: Japanese text plus English for learners."""

    text: str
    reading: str | None = None
    romaji: str | None = None
    meaning: str | None = None


class Place(BaseModel):
    id: str
    name: JpName
    category: str = ""
    # Neighborhood shown on the map, e.g. "Koenji". Free text.
    area: str = ""
    lat: float
    lng: float
    address: str = ""


class Visit(BaseModel):
    visit_id: str
    place: Place
    when: datetime
    tango_count: int = 0


class VisitCreateRequest(BaseModel):
    place_id: str = Field(min_length=1)
    when: datetime


class MapPin(BaseModel):
    """One pin on the Today map."""

    id: str
    label: str
    count: int
    lat: float
    lng: float
    kind: str  # 'tango' | 'next'
    area_id: str | None = None
    stars: int = 0


class MapArea(BaseModel):
    """Card shown when a pin is tapped ("Around Koenji")."""

    id: str
    label: str
    tango_count: int
    place_count: int
    sample: list[FlashcardResponse]
    more_count: int
    plan_place_id: str | None = None


class TodayResponse(BaseModel):
    user_name: str
    up_next: Visit | None = None
    pins: list[MapPin]
    areas: list[MapArea]
    starter_tango: list[JpName]
