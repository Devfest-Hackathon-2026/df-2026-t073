import firebase_admin
from google.cloud.firestore import AsyncClient

from app.core.config import settings

_firestore_client: AsyncClient | None = None


def init_firebase() -> None:
    """Initialize Firebase Admin SDK and Async Firestore client using Application Default Credentials."""
    global _firestore_client

    if not firebase_admin._apps:
        options = (
            {"projectId": settings.FIREBASE_PROJECT_ID}
            if settings.FIREBASE_PROJECT_ID
            else None
        )
        firebase_admin.initialize_app(options=options)

    if _firestore_client is None:
        _firestore_client = AsyncClient(
            project=settings.FIREBASE_PROJECT_ID,
            database=settings.FIRESTORE_DATABASE_ID,
        )


async def close_firebase() -> None:
    """Cleanly close the Async Firestore client on application shutdown."""
    global _firestore_client
    if _firestore_client is not None:
        _firestore_client.close()
        _firestore_client = None


def get_firestore_client() -> AsyncClient:
    """Return the active AsyncClient instance."""
    if _firestore_client is None:
        raise RuntimeError("Firestore client is not initialized.")
    return _firestore_client
