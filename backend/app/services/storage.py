import base64
import binascii
import logging
import uuid
from datetime import timedelta
from urllib.parse import quote

import anyio
from fastapi import HTTPException, status
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError

from app.core.config import settings
from app.core.firebase import get_storage_client

logger = logging.getLogger(__name__)

_ALLOWED_MIME_TYPES: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def decode_base64_image(image_base64: str, mime_type: str) -> tuple[bytes, str]:
    """Decode a raw or data-URI Base64 image and validate MIME type and byte size."""
    normalized_mime = mime_type.lower().strip()
    payload = image_base64.strip()

    if payload.startswith("data:"):
        header, _, payload = payload.partition(",")
        if ";base64" in header and header.startswith("data:"):
            extracted_mime = header[5:].split(";", 1)[0].strip().lower()
            if extracted_mime:
                normalized_mime = extracted_mime

    if normalized_mime not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported image type '{normalized_mime}'. Allowed: jpeg, png, webp.",
        )

    # Reject oversized Base64 strings before allocating decoded bytes
    max_b64_len = (settings.MAX_UPLOAD_BYTES * 4) // 3 + 64
    if len(payload) > max_b64_len:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Image exceeds maximum size of {settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MiB.",
        )

    try:
        image_bytes = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Base64 image payload.",
        ) from exc

    canonical_mime = validate_image_bytes(image_bytes, normalized_mime)
    return image_bytes, canonical_mime


def validate_mime_type(mime_type: str) -> str:
    """Validate and canonicalize an image MIME type before reading the request body."""
    normalized_mime = mime_type.lower().split(";", 1)[0].strip()
    if normalized_mime not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported image type '{normalized_mime}'. Allowed: jpeg, png, webp.",
        )
    return "image/jpeg" if normalized_mime == "image/jpg" else normalized_mime


def validate_image_bytes(image_bytes: bytes, mime_type: str) -> str:
    """Validate raw image bytes and MIME type."""
    canonical_mime = validate_mime_type(mime_type)
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded image is empty.",
        )
    if len(image_bytes) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Image exceeds maximum size of {settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MiB.",
        )
    return canonical_mime


def resolve_bucket_name() -> str:
    if settings.GCS_BUCKET_NAME:
        return settings.GCS_BUCKET_NAME.removeprefix("gs://").strip("/")
    if settings.FIREBASE_PROJECT_ID:
        return f"{settings.FIREBASE_PROJECT_ID}.firebasestorage.app"
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Cloud Storage bucket is not configured (set GCS_BUCKET_NAME or FIREBASE_PROJECT_ID).",
    )


# Backwards compatibility alias
_resolve_bucket_name = resolve_bucket_name


def upload_blob_sync(
    bucket_name: str,
    blob_path: str,
    image_bytes: bytes,
    content_type: str,
    capture_id: str | None = None,
) -> str:
    client = get_storage_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_path)

    # Set permanent Firebase Storage download token so image/audio URLs never expire
    # and require no IAM signing credentials or private keys.
    token = uuid.uuid4().hex
    blob.metadata = {"firebaseStorageDownloadTokens": token}
    blob.upload_from_string(image_bytes, content_type=content_type)

    encoded_path = quote(blob_path, safe="")
    return f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/{encoded_path}?alt=media&token={token}"


# Backwards compatibility alias
_upload_blob_sync = upload_blob_sync


async def download_capture_image(*, uid: str, capture_id: str) -> tuple[bytes, str]:
    """Download capture image from Cloud Storage, verifying existence."""
    bucket_name = resolve_bucket_name()
    client = get_storage_client()
    bucket = client.bucket(bucket_name)

    for ext, mime in [("jpg", "image/jpeg"), ("png", "image/png"), ("webp", "image/webp")]:
        blob_path = f"captures/{uid}/{capture_id}.{ext}"
        blob = bucket.blob(blob_path)
        exists = await anyio.to_thread.run_sync(blob.exists)
        if exists:
            data = await anyio.to_thread.run_sync(blob.download_as_bytes)
            return data, mime

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Capture image not found.")


async def delete_capture_blob(*, uid: str, capture_id: str) -> None:
    """Clean up a capture blob (e.g. if Firestore metadata write fails)."""
    try:
        bucket_name = resolve_bucket_name()
        client = get_storage_client()
        bucket = client.bucket(bucket_name)
        for ext in ("jpg", "png", "webp"):
            blob_path = f"captures/{uid}/{capture_id}.{ext}"
            blob = bucket.blob(blob_path)
            if await anyio.to_thread.run_sync(blob.exists):
                await anyio.to_thread.run_sync(blob.delete)
                break
    except Exception:
        logger.warning("Could not clean up orphaned blob for capture %s", capture_id)


async def upload_capture_image(
    *,
    uid: str,
    capture_id: str,
    image_bytes: bytes,
    mime_type: str,
) -> str:
    """Upload capture image to Cloud Storage and return a safe short-lived/authenticated URL."""
    bucket_name = resolve_bucket_name()
    ext = _ALLOWED_MIME_TYPES[mime_type]
    blob_path = f"captures/{uid}/{capture_id}.{ext}"

    try:
        return await anyio.to_thread.run_sync(
            lambda: upload_blob_sync(bucket_name, blob_path, image_bytes, mime_type, capture_id=capture_id)
        )
    except GoogleAuthError as exc:
        logger.exception("Cloud Storage authentication failed for gs://%s/%s", bucket_name, blob_path)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloud Storage authentication unavailable.",
        ) from exc
    except GoogleAPICallError as exc:
        logger.exception("Failed to upload image to gs://%s/%s", bucket_name, blob_path)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to store image in Cloud Storage.",
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected error uploading image to gs://%s/%s", bucket_name, blob_path)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to store image in Cloud Storage.",
        ) from exc

