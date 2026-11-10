"""Purge user data and account records (privacy and compliance)."""

import asyncio
import logging

from fastapi import HTTPException, status
from firebase_admin import auth
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError
from google.cloud.firestore import AsyncClient

from app.core.firebase import get_storage_client
from app.services.firestore import USERS_COLLECTION
from app.services.storage import _resolve_bucket_name

logger = logging.getLogger(__name__)

SUBCOLLECTIONS = (
    "captures",
    "flashcards",
    "review_sessions",
    "rehearsals",
    "visits",
    "lists",
    "usage",
    "favorite_places",
)


async def delete_user_account(*, db: AsyncClient, uid: str) -> None:
    """Purge all Firestore subcollections, the user doc, Storage blobs, and Firebase Auth record.

    Every data step runs even if an earlier one fails, so a retry has less left to do.
    If any data could not be deleted, raises 503 (and keeps the sign-in) so the app
    doesn't report success. The Firebase Auth record goes last and is best effort:
    a leftover sign-in holds no data.
    """
    user_ref = db.collection(USERS_COLLECTION).document(uid)
    failed: list[str] = []

    # 1. Delete all Firestore subcollections under users/{uid}
    for sub in SUBCOLLECTIONS:
        try:
            coll_ref = user_ref.collection(sub)
            async for doc in coll_ref.stream():
                await doc.reference.delete()
        except (GoogleAPICallError, GoogleAuthError):
            logger.exception("Failed to purge subcollection %s for uid=%s", sub, uid)
            failed.append(sub)

    # 2. Delete the user document itself
    try:
        await user_ref.delete()
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Failed to delete user document for uid=%s", uid)
        failed.append("profile")

    # 3. Photos in Cloud Storage (synchronous client, so off the event loop)
    if not await asyncio.to_thread(_purge_photos_sync, uid):
        failed.append("photos")

    if failed:
        # Keep the sign-in so the user can retry.
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not delete everything ({', '.join(failed)}). Try again.",
        )

    # 4. Firebase Auth record, last
    await asyncio.to_thread(_delete_auth_sync, uid)


def _purge_photos_sync(uid: str) -> bool:
    """Returns False if the photos could not be deleted."""
    try:
        bucket = get_storage_client().bucket(_resolve_bucket_name())
        blobs = list(bucket.list_blobs(prefix=f"captures/{uid}/"))
        if blobs:
            bucket.delete_blobs(blobs)
    except Exception:
        logger.exception("Failed to delete storage blobs for uid=%s", uid)
        return False
    return True


def _delete_auth_sync(uid: str) -> None:
    try:
        auth.delete_user(uid)
    except Exception:
        logger.warning("Could not delete Firebase Auth record for uid=%s (already deleted or ADC restricted)", uid)
