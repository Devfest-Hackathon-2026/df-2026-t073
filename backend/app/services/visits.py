"""Planned visits (users/{uid}/visits) and the Today screen summary."""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import HTTPException, status
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError
from google.cloud.firestore import AsyncClient, Query

from app.schemas.flashcard import FlashcardResponse
from app.schemas.place import MapPin, TodayResponse, Visit, VisitCreateRequest
from app.schemas.user import HomeArea
from app.services import place_rules as rules
from app.services.firestore import USERS_COLLECTION, list_flashcards
from app.services.places import areas_for, get_place
from app.services.profile import display_name

logger = logging.getLogger(__name__)

VISITS_SUBCOLLECTION = "visits"
# A visit still counts as "up next" for a while after its start time.
VISIT_GRACE = timedelta(hours=3)
MAX_VISITS = 20
MAX_CARDS = 500


def _visits(db: AsyncClient, uid: str) -> Any:
    return db.collection(USERS_COLLECTION).document(uid).collection(VISITS_SUBCOLLECTION)


def _tango_count(cards: list[FlashcardResponse], place_id: str) -> int:
    return sum(1 for c in cards if any(s.place_id == place_id for s in c.sightings))


async def list_upcoming_visits(
    *, db: AsyncClient, uid: str, cards: list[FlashcardResponse] | None = None
) -> list[Visit]:
    since = datetime.now(timezone.utc) - VISIT_GRACE
    query = _visits(db, uid).where("when", ">=", since).order_by("when", direction=Query.ASCENDING).limit(MAX_VISITS)
    try:
        visits = [Visit.model_validate(doc.to_dict()) async for doc in query.stream()]
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to list visits for uid=%s", uid)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Failed to list visits.") from exc
    if cards is None:
        cards = await list_flashcards(db=db, uid=uid, limit=MAX_CARDS)
    return [v.model_copy(update={"tango_count": _tango_count(cards, v.place.id)}) for v in visits]


async def create_visit(
    *, db: AsyncClient, http: httpx.AsyncClient, uid: str, request: VisitCreateRequest
) -> Visit:
    place = await get_place(http=http, db=db, place_id=request.place_id)
    when = request.when if request.when.tzinfo else request.when.replace(tzinfo=timezone.utc)
    visit = Visit(visit_id=f"vs_{uuid.uuid4().hex[:16]}", place=place, when=when)
    try:
        await _visits(db, uid).document(visit.visit_id).set(visit.model_dump(mode="python"))
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to save visit for uid=%s", uid)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Failed to save visit.") from exc
    return visit


async def delete_visit(*, db: AsyncClient, uid: str, visit_id: str) -> None:
    try:
        await _visits(db, uid).document(visit_id).delete()
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to delete visit %s for uid=%s", visit_id, uid)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Failed to delete visit.") from exc


async def build_today(*, db: AsyncClient, uid: str) -> TodayResponse:
    """Greeting name, next visit, and map pins from the user's own Tango.

    Sightings inside the home area are never turned into pins.
    """
    try:
        snap = await db.collection(USERS_COLLECTION).document(uid).get()
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to read user for uid=%s", uid)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Failed to load Today.") from exc
    user = snap.to_dict() or {}
    home = HomeArea.model_validate(user["home_area"]) if user.get("home_area") else None

    cards = await list_flashcards(db=db, uid=uid, limit=MAX_CARDS)
    place_ids = {s.place_id for c in cards for s in c.sightings if s.place_id}
    pins, areas = rules.build_map(cards, await areas_for(db, place_ids), home)

    visits = await list_upcoming_visits(db=db, uid=uid, cards=cards)
    up_next = visits[0] if visits else None
    if up_next:
        pins.append(
            MapPin(
                id="pin-next",
                label="Up next",
                count=0,
                lat=up_next.place.lat,
                lng=up_next.place.lng,
                kind="next",
            )
        )

    return TodayResponse(
        user_name=display_name(user),
        up_next=up_next,
        pins=pins,
        areas=areas,
        starter_tango=rules.STARTER_TANGO,
    )
