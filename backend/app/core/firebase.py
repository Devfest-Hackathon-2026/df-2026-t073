import inspect
import logging
import threading
from typing import Any

import anyio
import firebase_admin
import google.auth
import google.auth.transport.requests
import httpx
from google.auth.exceptions import DefaultCredentialsError
from google.cloud import storage
from google.cloud.firestore import AsyncClient

from app.core.config import settings

logger = logging.getLogger(__name__)

_firestore_client: AsyncClient | None = None
_storage_client: storage.Client | None = None
_http_client: httpx.AsyncClient | None = None
_gcp_credentials: Any = None
_lock = threading.Lock()


def init_firebase() -> None:
    """Initialize Firebase Admin SDK, Async Firestore client, and shared HTTP client."""
    global _firestore_client, _http_client

    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0))

    if not firebase_admin._apps:
        options = (
            {"projectId": settings.FIREBASE_PROJECT_ID}
            if settings.FIREBASE_PROJECT_ID
            else None
        )
        firebase_admin.initialize_app(options=options)

    if _firestore_client is None:
        try:
            _firestore_client = AsyncClient(
                project=settings.FIREBASE_PROJECT_ID,
                database=settings.FIRESTORE_DATABASE_ID,
            )
        except DefaultCredentialsError:
            logger.warning(
                "Google Application Default Credentials not found; "
                "Firestore client will remain uninitialized (503 on DB routes)."
            )


async def close_firebase() -> None:
    """Close Firestore gRPC channel, Storage client, and shared HTTP client on shutdown."""
    global _firestore_client, _storage_client, _http_client, _gcp_credentials

    client = _firestore_client
    _firestore_client = None
    if client is not None:
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

    with _lock:
        storage_client = _storage_client
        _storage_client = None
        _gcp_credentials = None

    if storage_client is not None:
        try:
            storage_client.close()
        except Exception:
            logger.exception("Failed to close Cloud Storage client")

    http_client = _http_client
    _http_client = None
    if http_client is not None:
        try:
            await http_client.aclose()
        except Exception:
            logger.exception("Failed to close HTTP client")


def get_firestore_client() -> AsyncClient:
    """Return the active AsyncClient instance."""
    if _firestore_client is None:
        raise RuntimeError("Firestore client is not initialized.")
    return _firestore_client


def get_storage_client() -> storage.Client:
    """Return or lazily create the shared Cloud Storage client."""
    global _storage_client
    with _lock:
        if _storage_client is None:
            _storage_client = storage.Client(project=settings.FIREBASE_PROJECT_ID)
        return _storage_client


def get_http_client() -> httpx.AsyncClient:
    """Return the active shared httpx.AsyncClient instance."""
    if _http_client is None:
        raise RuntimeError("HTTP client is not initialized.")
    return _http_client


def _refresh_adc_token_sync() -> str:
    """Fetch or refresh Google Application Default Credentials token synchronously."""
    global _gcp_credentials
    with _lock:
        if _gcp_credentials is None:
            _gcp_credentials, _ = google.auth.default(
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
        if (
            not _gcp_credentials.valid
            or _gcp_credentials.expired
            or not _gcp_credentials.token
        ):
            _gcp_credentials.refresh(google.auth.transport.requests.Request())
        return str(_gcp_credentials.token)


async def get_gcp_access_token() -> str:
    """Return a valid GCP OAuth2 access token using ADC without blocking the event loop."""
    return await anyio.to_thread.run_sync(_refresh_adc_token_sync)
