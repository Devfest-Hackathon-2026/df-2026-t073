import inspect
import logging

import firebase_admin
from google.cloud.firestore import AsyncClient

from app.core.config import settings

logger = logging.getLogger(__name__)

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
    """Close the Firestore gRPC channel on application shutdown."""
    global _firestore_client
    client = _firestore_client
    if client is None:
        return
    try:
        # AsyncClient.close() only closes an HTTP session Firestore never creates,
        # so close the gRPC transport directly. The API object is created lazily;
        # if no request ever ran, there is no channel to close.
        api = getattr(client, "_firestore_api_internal", None)
        if api is not None:
            result = api.transport.close()
            if inspect.isawaitable(result):
                await result
    except Exception:
        logger.exception("Failed to close Firestore client")
    finally:
        _firestore_client = None


def get_firestore_client() -> AsyncClient:
    """Return the active AsyncClient instance."""
    if _firestore_client is None:
        raise RuntimeError("Firestore client is not initialized.")
    return _firestore_client
