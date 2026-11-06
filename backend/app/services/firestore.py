from typing import Any

from google.cloud.firestore import AsyncClient

from app.schemas.user import UserProfile

USERS_COLLECTION = "users"


async def sync_user_profile(
    db: AsyncClient, decoded_claims: dict[str, Any]
) -> UserProfile:
    """Create or merge the authenticated user's profile document in Firestore."""
    uid = decoded_claims["uid"]
    profile_data = {
        "uid": uid,
        "email": decoded_claims.get("email"),
        "name": decoded_claims.get("name"),
        "picture": decoded_claims.get("picture"),
        "email_verified": bool(decoded_claims.get("email_verified", False)),
    }

    doc_ref = db.collection(USERS_COLLECTION).document(uid)
    await doc_ref.set(profile_data, merge=True)

    snapshot = await doc_ref.get()
    data = snapshot.to_dict() or profile_data
    return UserProfile(**data)
