"""Favorite places: users/{uid}/favorite_places/{place_id}, a Place snapshot each."""

import logging
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import HTTPException, status
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError
from google.cloud.firestore import AsyncClient, Query

from app.schemas.place import MapPin, Place
from app.services.firestore import USERS_COLLECTION
from app.services.places import get_place

logger = logging.getLogger(__name__)

FAVORITE_PLACES_SUBCOLLECTION = "favorite_places"
MAX_FAVORITES = 100


def _favorites(db: AsyncClient, uid: str) -> Any:
    return (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(FAVORITE_PLACES_SUBCOLLECTION)
    )


async def list_favorite_places(*, db: AsyncClient, uid: str) -> list[Place]:
    """The user's favorite places, newest first."""
    query = (
        _favorites(db, uid)
        .order_by("added_at", direction=Query.DESCENDING)
        .limit(MAX_FAVORITES)
    )
    try:
        return [
            Place.model_validate(doc.to_dict()["place"]) async for doc in query.stream()
        ]
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to list favorite places for uid=%s", uid)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to list favorite places.",
        ) from exc


async def add_favorite_place(
    *, db: AsyncClient, http: httpx.AsyncClient, uid: str, place_id: str
) -> Place:
    """Favorite a place. Adding one twice keeps a single entry."""
    place = await get_place(http=http, db=db, place_id=place_id)
    try:
        await (
            _favorites(db, uid)
            .document(place.id)
            .set(
                {
                    "place": place.model_dump(mode="python"),
                    "added_at": datetime.now(UTC),
                }
            )
        )
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to save favorite place %s for uid=%s", place_id, uid)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to save favorite place.",
        ) from exc
    return place


async def remove_favorite_place(*, db: AsyncClient, uid: str, place_id: str) -> None:
    """Un-favorite a place. Removing one that isn't a favorite does nothing."""
    try:
        await _favorites(db, uid).document(place_id).delete()
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception(
            "Failed to remove favorite place %s for uid=%s", place_id, uid
        )
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to remove favorite place.",
        ) from exc


def favorite_pins(places: list[Place]) -> list[MapPin]:
    """One map pin per favorite place."""
    return [
        MapPin(
            id=f"fav-{p.id}",
            label=p.name.text,
            count=0,
            lat=p.lat,
            lng=p.lng,
            kind="favorite",
            place_id=p.id,
        )
        for p in places
    ]
