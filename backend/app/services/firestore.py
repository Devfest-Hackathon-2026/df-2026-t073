import logging
from typing import Any

from google.api_core.exceptions import GoogleAPICallError
from google.cloud.firestore import AsyncClient

from app.schemas.user import UserProfile

logger = logging.getLogger(__name__)

USERS_COLLECTION = "users"


async def sync_user_profile(
    db: AsyncClient, decoded_claims: dict[str, Any]
) -> UserProfile:
    """Return the user's profile and store it in Firestore when the token's claims changed.

    The response comes entirely from the verified token, so a Firestore error
    is logged and does not fail the request.
    """
    uid = decoded_claims["uid"]
    profile_data = {
        "uid": uid,
        "email": decoded_claims.get("email"),
        "name": decoded_claims.get("name"),
        "picture": decoded_claims.get("picture"),
        "email_verified": bool(decoded_claims.get("email_verified", False)),
    }

    doc_ref = db.collection(USERS_COLLECTION).document(uid)
    try:
        # A read is cheaper than a write and avoids write contention on the doc.
        snapshot = await doc_ref.get()
        stored = snapshot.to_dict() or {}
        if any(stored.get(k) != v for k, v in profile_data.items()):
            await doc_ref.set(profile_data, merge=True)
    except GoogleAPICallError:
        logger.exception("Failed to sync profile for uid=%s", uid)

    return UserProfile(**profile_data)
