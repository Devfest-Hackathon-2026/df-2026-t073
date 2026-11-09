"""The user's profile: chosen name, reading level, home area, and Me-tab stats.

Profile fields live on users/{uid} next to the token claims that /me syncs.
The chosen name is stored as `display_name`, so syncing token claims (where
anonymous users have no name) never overwrites it.
"""

import logging
from typing import Any

from fastapi import HTTPException, status
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError
from google.cloud.firestore import AsyncClient

from app.schemas.flashcard import FlashcardResponse
from app.schemas.user import ProfileResponse, ProfileStats, ProfileUpdateRequest
from app.services.firestore import USERS_COLLECTION, list_flashcards
from app.services.tango_rules import is_mastered

logger = logging.getLogger(__name__)

DEFAULT_NAME = "Learner"
# Enough for a hackathon-sized collection; stats count everything loaded.
MAX_CARDS = 500

def display_name(stored: dict[str, Any]) -> str:
    """Chosen name, else the sign-in name, else a friendly default."""
    for key in ("display_name", "name"):
        value = stored.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return DEFAULT_NAME


def compute_stats(cards: list[FlashcardResponse]) -> ProfileStats:
    places = {s.place_name for c in cards for s in c.sightings if s.place_name}
    return ProfileStats(
        tango=len(cards),
        stars=sum(1 for c in cards if is_mastered(c.strength)),
        places=len(places),
    )


def build_profile(uid: str, stored: dict[str, Any], cards: list[FlashcardResponse]) -> ProfileResponse:
    return ProfileResponse(
        uid=uid,
        name=display_name(stored),
        reading_level=stored.get("reading_level"),
        home_area=stored.get("home_area"),
        stats=compute_stats(cards),
    )


async def _read_user(db: AsyncClient, uid: str) -> dict[str, Any]:
    try:
        snapshot = await db.collection(USERS_COLLECTION).document(uid).get()
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to read profile for uid=%s", uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to read profile.",
        ) from exc
    return snapshot.to_dict() or {}


async def get_profile(*, db: AsyncClient, uid: str) -> ProfileResponse:
    stored = await _read_user(db, uid)
    cards = await list_flashcards(db=db, uid=uid, limit=MAX_CARDS)
    return build_profile(uid, stored, cards)


async def update_profile(*, db: AsyncClient, uid: str, update: ProfileUpdateRequest) -> ProfileResponse:
    changes: dict[str, Any] = {}
    if update.name is not None:
        changes["display_name"] = update.name.strip()
    if update.reading_level is not None:
        changes["reading_level"] = update.reading_level
    if update.home_area is not None:
        changes["home_area"] = update.home_area.model_dump(mode="python")
    if changes:
        try:
            await db.collection(USERS_COLLECTION).document(uid).set(changes, merge=True)
        except (GoogleAPICallError, GoogleAuthError) as exc:
            logger.exception("Failed to update profile for uid=%s", uid)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Failed to save profile.",
            ) from exc
    return await get_profile(db=db, uid=uid)
