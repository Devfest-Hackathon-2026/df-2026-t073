"""Purge user data and account records (privacy and compliance)."""

import asyncio
import logging

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
    """Purge all Firestore subcollections, the user doc, Storage blobs, and Firebase Auth record."""
    user_ref = db.collection(USERS_COLLECTION).document(uid)

    # 1. Delete all Firestore subcollections under users/{uid}
    for sub in SUBCOLLECTIONS:
        try:
            coll_ref = user_ref.collection(sub)
            async for doc in coll_ref.stream():
                await doc.reference.delete()
        except (GoogleAPICallError, GoogleAuthError):
            logger.exception("Failed to purge subcollection %s for uid=%s", sub, uid)

    # 2. Delete the user document itself
    try:
        await user_ref.delete()
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Failed to delete user document for uid=%s", uid)

    # 3 & 4. Offload synchronous Cloud Storage and Firebase Auth deletions to a worker thread
    await asyncio.to_thread(_purge_storage_and_auth_sync, uid)


def _purge_storage_and_auth_sync(uid: str) -> None:
    # 3. Delete user photos from Cloud Storage
    try:
        bucket_name = _resolve_bucket_name()
        storage_client = get_storage_client()
        bucket = storage_client.bucket(bucket_name)
        blobs = list(bucket.list_blobs(prefix=f"captures/{uid}/"))
        if blobs:
            bucket.delete_blobs(blobs)
    except Exception:
        logger.exception("Failed to delete storage blobs for uid=%s", uid)

    # 4. Delete Firebase Auth user record
    try:
        auth.delete_user(uid)
    except Exception:
        logger.warning("Could not delete Firebase Auth record for uid=%s (already deleted or ADC restricted)", uid)

