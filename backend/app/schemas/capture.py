from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Vertex(BaseModel):
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)


class DetectedItem(BaseModel):
    item_id: str
    item_type: Literal["object", "text"]
    source_label: str
    japanese_text: str
    reading: str | None = None
    english_gloss: str | None = None
    confidence: float | None = None
    bounding_box: list[Vertex] = Field(default_factory=list)


class CaptureUploadRequest(BaseModel):
    image_base64: str = Field(
        ...,
        description="Base64-encoded image string (raw base64 or data:image/...;base64,... URI).",
    )
    mime_type: str = Field(
        default="image/jpeg",
        description="Image MIME type: image/jpeg, image/png, or image/webp.",
    )


class CaptureResponse(BaseModel):
    capture_id: str
    image_url: str
    detected_items: list[DetectedItem]
    created_at: datetime

