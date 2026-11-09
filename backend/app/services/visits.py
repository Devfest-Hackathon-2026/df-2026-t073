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
from app.schemas.place import MapPin, TodayResponse, Visit, VisitCreateRequest, WordOfDay
from app.schemas.user import HomeArea
from app.services import place_rules as rules
from app.services import word_of_day
from app.services.favorite_places import favorite_pins, list_favorite_places
from app.services.firestore import USERS_COLLECTION, list_flashcards
from app.services.places import get_place, place_facts
from app.services.profile import display_name
from app.services.review_rules.selection import build_review_card

logger = logging.getLogger(__name__)

VISITS_SUBCOLLECTION = "visits"
# A visit still counts as "up next" for a while after its start time.
VISIT_GRACE = timedelta(hours=3)
MAX_VISITS = 20
MAX_CARDS = 1000


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
    facts = await place_facts(db, place_ids)
    area_names = {pid: area for pid, (area, _) in facts.items() if area}
    pins, areas = rules.build_map(cards, area_names, home)

    visits = await list_upcoming_visits(db=db, uid=uid, cards=cards)
    up_next = visits[0] if visits else None
    if up_next:
        pins.append(
            MapPin(
                id="pin-next",
                label=up_next.place.name.text,
                count=0,
                lat=up_next.place.lat,
                lng=up_next.place.lng,
                kind="next",
            )
        )

    pins.extend(favorite_pins(await list_favorite_places(db=db, uid=uid)))

    return TodayResponse(
        user_name=display_name(user),
        up_next=up_next,
        pins=pins,
        areas=areas,
        starter_tango=rules.STARTER_TANGO,
        word_of_day=_word_of_day(uid, user, cards, visits, facts),
        review_card=build_review_card(cards, datetime.now(timezone.utc)),
        total_tango=len(cards),
    )


# Word of the day changes at midnight in Japan.
JST = timezone(timedelta(hours=9))


def _word_of_day(
    uid: str,
    user: dict[str, Any],
    cards: list[FlashcardResponse],
    visits: list[Visit],
    facts: dict[str, tuple[str, str]],
) -> WordOfDay | None:
    """Level- and interest-based pick from what Today already loaded."""
    # Where each Tango was first caught says what the user is into.
    caught_categories = []
    for card in cards:
        first = next((s.place_id for s in card.sightings if s.place_id), None)
        if first and facts.get(first, ("", ""))[1]:
            caught_categories.append(facts[first][1])
    next_visit = visits[0] if visits else None
    weights = word_of_day.interest_weights(
        next_visit_category=next_visit.place.category if next_visit else None,
        other_visit_categories=[v.place.category for v in visits[1:]],
        caught_categories=caught_categories,
    )
    pick = word_of_day.pick_word(
        reading_level=user.get("reading_level"),
        weights=weights,
        owned={card.kanji for card in cards},
        seed=word_of_day.seed_for(uid, datetime.now(JST).date()),
        next_visit_name=next_visit.place.name.text if next_visit else None,
        next_visit_category=next_visit.place.category if next_visit else None,
    )
    card = word_of_day.word_card(pick) if pick else None
    if pick is None or card is None:
        return None
    return WordOfDay(
        text=card.text,
        reading=card.reading,
        romaji=card.romaji,
        meaning=card.meaning,
        reason=pick.reason,
    )
