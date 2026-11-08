"""Shared Gemini call: structured JSON output, optionally with inline audio/images."""

import base64
import json
import logging
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)


async def generate_json(
    *,
    http: httpx.AsyncClient,
    prompt: str,
    schema: dict[str, Any],
    temperature: float = 0.3,
    inline: list[tuple[bytes, str]] | None = None,
) -> Any:
    """Ask Gemini for JSON matching `schema`. `inline` adds (bytes, mime_type) parts.

    Raises 503 when no key is configured and 502 when Gemini fails, so callers
    can show a clear error instead of half-filled data.
    """
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="GEMINI_API_KEY is not configured.")
    parts: list[dict[str, Any]] = [
        {"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode("ascii")}}
        for data, mime in (inline or [])
    ]
    parts.append({"text": prompt})
    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
            "responseSchema": schema,
        },
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent"
    try:
        resp = await http.post(url, headers={"x-goog-api-key": settings.GEMINI_API_KEY}, json=body)
        resp.raise_for_status()
        candidates = resp.json().get("candidates") or []
        if not candidates:
            raise ValueError("Gemini returned no candidates.")
        return json.loads(candidates[0]["content"]["parts"][0]["text"])
    except httpx.HTTPStatusError as exc:
        logger.error("Gemini returned HTTP %s: %s", exc.response.status_code, exc.response.text[:300])
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Gemini request failed.") from exc
    except Exception as exc:
        logger.exception("Gemini call failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Invalid response from Gemini.") from exc


def jp_schema() -> dict[str, Any]:
    """Schema for a Japanese phrase with reading, romaji and English."""
    return {
        "type": "OBJECT",
        "properties": {
            "text": {"type": "STRING"},
            "reading": {"type": "STRING"},
            "romaji": {"type": "STRING"},
            "meaning": {"type": "STRING"},
        },
        "required": ["text", "reading", "romaji", "meaning"],
    }
