import base64
import json
import logging
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.firebase import get_gcp_access_token
from app.schemas.capture import DetectedItem, Vertex

logger = logging.getLogger(__name__)

_VISION_ANNOTATE_URL = "https://vision.googleapis.com/v1/images:annotate"


def _clamp(val: float) -> float:
    return max(0.0, min(1.0, round(val, 4)))


def _parse_normalized_vertices(poly: dict[str, Any]) -> list[Vertex]:
    vertices = poly.get("normalizedVertices") or []
    return [
        Vertex(x=_clamp(float(v.get("x", 0.0))), y=_clamp(float(v.get("y", 0.0))))
        for v in vertices
    ]


def _parse_pixel_vertices(
    poly: dict[str, Any], width: float, height: float
) -> list[Vertex]:
    vertices = poly.get("vertices") or []
    if width <= 0 or height <= 0:
        return []
    return [
        Vertex(
            x=_clamp(float(v.get("x", 0.0)) / width),
            y=_clamp(float(v.get("y", 0.0)) / height),
        )
        for v in vertices
    ]


async def _enrich_items_with_gemini(
    http_client: httpx.AsyncClient,
    raw_items: list[DetectedItem],
) -> list[DetectedItem]:
    """Translate English object labels to natural Japanese and add readings/glosses via Gemini."""
    if not raw_items or not settings.GEMINI_API_KEY:
        return raw_items

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.GEMINI_MODEL}:generateContent"
    )
    items_payload = [
        {
            "item_id": item.item_id,
            "item_type": item.item_type,
            "source_label": item.source_label,
        }
        for item in raw_items
    ]
    prompt = (
        "You are a Japanese vocabulary assistant for the Tankengo app. "
        "For each detected object or OCR text item from a photo:\n"
        "- If item_type is 'object', translate the English source_label into the most natural "
        "everyday Japanese word (kanji or kana as commonly written).\n"
        "- If item_type is 'text', clean up the extracted text into the primary Japanese vocabulary word "
        "(or translate it to Japanese if the extracted text is English).\n"
        "- Provide the hiragana reading and a concise English gloss for every item.\n\n"
        f"Input items:\n{json.dumps(items_payload, ensure_ascii=False)}"
    )

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "item_id": {"type": "STRING"},
                        "japanese_text": {"type": "STRING"},
                        "reading": {"type": "STRING"},
                        "english_gloss": {"type": "STRING"},
                    },
                    "required": ["item_id", "japanese_text", "reading", "english_gloss"],
                },
            },
        },
    }

    try:
        resp = await http_client.post(
            url,
            headers={"x-goog-api-key": settings.GEMINI_API_KEY},
            json=body,
        )
        resp.raise_for_status()
        candidates = resp.json().get("candidates") or []
        if not candidates:
            return raw_items
        text_out = candidates[0]["content"]["parts"][0]["text"]
        enriched_list: list[dict[str, str]] = json.loads(text_out)
        by_id = {entry["item_id"]: entry for entry in enriched_list if "item_id" in entry}

        for item in raw_items:
            match = by_id.get(item.item_id)
            if match:
                item.japanese_text = match.get("japanese_text") or item.japanese_text
                item.reading = match.get("reading")
                item.english_gloss = match.get("english_gloss")
    except Exception:
        logger.exception("Gemini label enrichment failed; returning raw Vision labels")

    return raw_items


async def recognize_image_items(
    *,
    http_client: httpx.AsyncClient,
    image_bytes: bytes,
) -> list[DetectedItem]:
    """Run Cloud Vision OBJECT_LOCALIZATION and TEXT_DETECTION and return Japanese-labeled items."""
    try:
        access_token = await get_gcp_access_token()
    except Exception as exc:
        logger.exception("Failed to acquire GCP access token for Cloud Vision API")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloud Vision authentication unavailable.",
        ) from exc

    encoded_image = base64.b64encode(image_bytes).decode("ascii")
    vision_request = {
        "requests": [
            {
                "image": {"content": encoded_image},
                "features": [
                    {"type": "OBJECT_LOCALIZATION", "maxResults": 10},
                    {"type": "TEXT_DETECTION", "maxResults": 15},
                ],
                "imageContext": {"languageHints": ["ja", "en"]},
            }
        ]
    }

    headers = {"Authorization": f"Bearer {access_token}"}
    if settings.FIREBASE_PROJECT_ID:
        headers["x-goog-user-project"] = settings.FIREBASE_PROJECT_ID

    try:
        resp = await http_client.post(
            _VISION_ANNOTATE_URL,
            headers=headers,
            json=vision_request,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.exception("Cloud Vision API returned error status %s", exc.response.status_code)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Cloud Vision API request failed.",
        ) from exc
    except httpx.HTTPError as exc:
        logger.exception("Failed to reach Cloud Vision API")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Cloud Vision API unreachable.",
        ) from exc

    responses = resp.json().get("responses") or []
    if not responses:
        return []

    annotation = responses[0]
    if "error" in annotation:
        logger.error("Cloud Vision annotation error: %s", annotation["error"])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=annotation["error"].get("message", "Cloud Vision annotation error."),
        )

    detected: list[DetectedItem] = []
    seen_labels: set[str] = set()

    # 1. Extract localized physical objects
    for idx, obj in enumerate(annotation.get("localizedObjectAnnotations") or []):
        name = (obj.get("name") or "").strip()
        if not name or name.lower() in seen_labels:
            continue
        seen_labels.add(name.lower())
        detected.append(
            DetectedItem(
                item_id=f"obj_{idx}",
                item_type="object",
                source_label=name,
                japanese_text=name,
                english_gloss=name,
                confidence=round(float(obj.get("score", 0.0)), 3),
                bounding_box=_parse_normalized_vertices(obj.get("boundingPoly") or {}),
            )
        )

    # 2. Extract OCR text blocks using full page dimensions from fullTextAnnotation
    text_annotations = annotation.get("textAnnotations") or []
    if len(text_annotations) > 1:
        pages = (annotation.get("fullTextAnnotation") or {}).get("pages") or []
        img_width = float(pages[0].get("width", 0.0)) if pages else 0.0
        img_height = float(pages[0].get("height", 0.0)) if pages else 0.0
        if img_width <= 0 or img_height <= 0:
            full_vertices = (text_annotations[0].get("boundingPoly") or {}).get("vertices") or []
            img_width = max((float(v.get("x", 0.0)) for v in full_vertices), default=0.0)
            img_height = max((float(v.get("y", 0.0)) for v in full_vertices), default=0.0)

        for idx, txt in enumerate(text_annotations[1:16]):
            word = (txt.get("description") or "").strip()
            if len(word) < 1 or word.lower() in seen_labels:
                continue
            seen_labels.add(word.lower())
            detected.append(
                DetectedItem(
                    item_id=f"txt_{idx}",
                    item_type="text",
                    source_label=word,
                    japanese_text=word,
                    bounding_box=_parse_pixel_vertices(
                        txt.get("boundingPoly") or {}, img_width, img_height
                    ),
                )
            )

    return await _enrich_items_with_gemini(http_client, detected)
