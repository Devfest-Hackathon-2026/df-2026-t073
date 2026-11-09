"""Per-user daily limits on endpoints that call paid Google APIs.

A counter per user and day (Japan time) at users/{uid}/usage/{YYYY-MM-DD}.
It protects the bill from a runaway client; limits are generous for real use
and can be changed with env vars (LIMIT_VISION=..., see core/config.py).
If the counter can't be reached, the call is allowed (fail open).
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError
from google.cloud.firestore import AsyncClient, Increment

from app.core.config import settings
from app.services.firestore import USERS_COLLECTION

logger = logging.getLogger(__name__)

USAGE_SUBCOLLECTION = "usage"
JST = timezone(timedelta(hours=9))

# kind -> what the user is told is used up.
LABELS = {
    "vision": "photo reads",
    "catch": "new Tango",
    "expand": "word expansions",
    "briefing": "visit briefings",
    "rehearsal": "rehearsals",
    "reply": "rehearsal replies",
    "tts": "audio",
    "review": "review sessions",
    "places": "place searches",
}


def usage_key(now: datetime) -> str:
    """The day a call counts toward (midnight in Japan)."""
    return now.astimezone(JST).date().isoformat()


def limit_for(kind: str) -> int:
    """0 or less means no limit."""
    return int(getattr(settings, f"LIMIT_{kind.upper()}", 0))


def is_over(count_after: int, limit: int) -> bool:
    return limit > 0 and count_after > limit


def limit_message(kind: str) -> str:
    return f"Daily limit reached for {LABELS.get(kind, kind)}. Try again tomorrow."


async def check_limit(*, db: AsyncClient, uid: str, kind: str, now: datetime | None = None) -> None:
    """Raises 429 when today's limit is already reached, without incrementing the counter."""
    limit = limit_for(kind)
    if limit <= 0:
        return
    ref = (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(USAGE_SUBCOLLECTION)
        .document(usage_key(now or datetime.now(timezone.utc)))
    )
    try:
        snap = await ref.get()
        count = int((snap.to_dict() or {}).get(kind, 0)) if getattr(snap, "exists", True) and hasattr(snap, "to_dict") else 0
    except (GoogleAPICallError, GoogleAuthError, AttributeError):
        logger.warning("Usage counter unavailable; allowing %s for %s", kind, uid)
        return
    if count >= limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=limit_message(kind))


async def charge(*, db: AsyncClient, uid: str, kind: str, now: datetime | None = None) -> None:
    """Counts one call; raises 429 when today's limit is used up."""
    limit = limit_for(kind)
    if limit <= 0:
        return
    ref = (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(USAGE_SUBCOLLECTION)
        .document(usage_key(now or datetime.now(timezone.utc)))
    )
    try:
        await ref.set({kind: Increment(1)}, merge=True)
        snap = await ref.get()
        count = int((snap.to_dict() or {}).get(kind, 0))
    except (GoogleAPICallError, GoogleAuthError, AttributeError):
        logger.warning("Usage counter unavailable; allowing %s for %s", kind, uid)
        return
    if is_over(count, limit):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=limit_message(kind))
