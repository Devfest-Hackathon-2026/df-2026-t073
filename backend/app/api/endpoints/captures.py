import asyncio
import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import ValidationError

from app.api.deps import CurrentUser, Db, HttpClient
from app.core.config import settings
from app.schemas.capture import CaptureResponse, CaptureUploadRequest
from app.services.firestore import get_capture, list_captures, save_capture
from app.services.storage import (
    decode_base64_image,
    upload_capture_image,
    validate_image_bytes,
    validate_mime_type,
)
from app.services.vision import recognize_image_items

router = APIRouter(prefix="/captures", tags=["captures"])


@router.post(
    "",
    response_model=CaptureResponse,
    status_code=status.HTTP_201_CREATED,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {
                    "schema": CaptureUploadRequest.model_json_schema(),
                },
                "image/jpeg": {"schema": {"type": "string", "format": "binary"}},
                "image/png": {"schema": {"type": "string", "format": "binary"}},
                "image/webp": {"schema": {"type": "string", "format": "binary"}},
            },
        }
    },
)
async def create_capture(
    request: Request,
    current_user: CurrentUser,
    db: Db,
    http_client: HttpClient,
) -> CaptureResponse:
    """Upload a picture (as JSON base64 or raw image binary), run Cloud Vision object/text recognition, and store the capture."""
    content_type = (request.headers.get("content-type") or "").lower().split(";", 1)[0].strip()
    content_length = request.headers.get("content-length")

    if content_type == "application/json":
        max_json_bytes = (settings.MAX_UPLOAD_BYTES * 4) // 3 + 4096
        if content_length and content_length.isdigit() and int(content_length) > max_json_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"Image exceeds maximum size of {settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MiB.",
            )
        try:
            raw_json = await request.json()
            payload = CaptureUploadRequest.model_validate(raw_json)
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=exc.errors(),
            ) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Malformed JSON body.",
            ) from exc
        image_bytes, mime_type = decode_base64_image(
            payload.image_base64, payload.mime_type
        )
    else:
        # Validate MIME type and Content-Length header before reading the body into memory
        mime_type = validate_mime_type(content_type)
        if content_length and content_length.isdigit() and int(content_length) > settings.MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"Image exceeds maximum size of {settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MiB.",
            )
        raw_bytes = await request.body()
        validate_image_bytes(raw_bytes, mime_type)
        image_bytes = raw_bytes

    uid = current_user["uid"]
    capture_id = f"cap_{uuid.uuid4().hex[:16]}"

    # Run Cloud Storage upload and Cloud Vision recognition concurrently
    image_url, detected_items = await asyncio.gather(
        upload_capture_image(
            uid=uid,
            capture_id=capture_id,
            image_bytes=image_bytes,
            mime_type=mime_type,
        ),
        recognize_image_items(
            http_client=http_client,
            image_bytes=image_bytes,
        ),
    )

    return await save_capture(
        db=db,
        uid=uid,
        capture_id=capture_id,
        image_url=image_url,
        detected_items=detected_items,
    )


@router.get("", response_model=list[CaptureResponse])
async def get_user_captures(
    current_user: CurrentUser,
    db: Db,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[CaptureResponse]:
    """List past uploaded pictures and detected items for the authenticated user."""
    return await list_captures(db=db, uid=current_user["uid"], limit=limit)


@router.get("/{capture_id}", response_model=CaptureResponse)
async def get_single_capture(
    capture_id: str,
    current_user: CurrentUser,
    db: Db,
) -> CaptureResponse:
    """Get a single uploaded picture and its selectable objects/text."""
    return await get_capture(db=db, uid=current_user["uid"], capture_id=capture_id)
