"""Shared Gemini call: structured JSON output, optionally with inline audio/images."""

import asyncio
import base64
import json
import logging
import random
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.firebase import get_gcp_access_token

logger = logging.getLogger(__name__)
RETRYABLE_STATUS_CODES = {429, 500, 503, 504}


def _retry_after(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            when = parsedate_to_datetime(value)
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
            return max(0.0, (when - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return None


def is_gemini_configured() -> bool:
    """Return True if Vertex AI (via FIREBASE_PROJECT_ID) or AI Studio (via GEMINI_API_KEY) is configured."""
    return bool(settings.FIREBASE_PROJECT_ID or settings.GEMINI_API_KEY)


async def generate_json(
    *,
    http: httpx.AsyncClient,
    prompt: str,
    schema: dict[str, Any],
    temperature: float = 0.3,
    inline: list[tuple[bytes, str]] | None = None,
) -> Any:
    """Ask Gemini / Vertex AI for JSON matching `schema`. `inline` adds (bytes, mime_type) parts.

    Raises 503 when neither Vertex AI nor an API key is configured, or when the service
    is temporarily unavailable, so callers can show a clear error instead of half-filled data.
    """
    if not is_gemini_configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Neither FIREBASE_PROJECT_ID (for Vertex AI) nor GEMINI_API_KEY is configured.",
        )
    parts: list[dict[str, Any]] = [
        {"inlineData": {"mimeType": mime, "data": base64.b64encode(data).decode("ascii")}}
        for data, mime in (inline or [])
    ]
    parts.append({"text": prompt})
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
            "responseSchema": schema,
        },
    }
    return await request_json(http=http, body=body)


async def request_json(*, http: httpx.AsyncClient, body: dict[str, Any]) -> Any:
    """Send a prepared structured-output request via Vertex AI (or AI Studio fallback) with retries."""
    project = settings.FIREBASE_PROJECT_ID
    location = getattr(settings, "VERTEX_LOCATION", "asia-northeast1")
    model = settings.GEMINI_MODEL

    if project:
        # Vertex AI REST API (Keyless via GCP Application Default Credentials)
        url = (
            f"https://{location}-aiplatform.googleapis.com/v1/"
            f"projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent"
        )
        token = await get_gcp_access_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "x-goog-user-project": project,
        }
    elif settings.GEMINI_API_KEY:
        # Fallback to AI Studio if no project ID is configured
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        headers = {
            "x-goog-api-key": settings.GEMINI_API_KEY,
            "Content-Type": "application/json",
        }
    else:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Neither FIREBASE_PROJECT_ID (for Vertex AI) nor GEMINI_API_KEY is configured.",
        )

    attempts = max(1, settings.GEMINI_MAX_ATTEMPTS)
    retry_budget = max(0.0, settings.GEMINI_RETRY_BUDGET_S)
    started = asyncio.get_running_loop().time()
    for attempt in range(attempts):
        try:
            resp = await http.post(url, headers=headers, json=body)
            if resp.status_code in RETRYABLE_STATUS_CODES:
                logger.warning("Gemini transient HTTP %s (attempt %s/%s)", resp.status_code, attempt + 1, attempts)
                if attempt + 1 < attempts:
                    wait = _retry_after(resp.headers.get("Retry-After"))
                    delay = wait if wait is not None else min(0.5 * (2 ** attempt), 4.0) * random.uniform(0.75, 1.25)
                    if asyncio.get_running_loop().time() - started + delay < retry_budget:
                        await asyncio.sleep(delay)
                        continue
                raise HTTPException(
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Gemini is temporarily busy.",
                    headers={"Retry-After": resp.headers.get("Retry-After", "5")},
                )
            resp.raise_for_status()
            candidates = resp.json().get("candidates") or []
            if not candidates:
                raise ValueError("Gemini returned no candidates.")
            return json.loads(candidates[0]["content"]["parts"][0]["text"])
        except HTTPException:
            raise
        except httpx.HTTPStatusError as exc:
            logger.error("Gemini returned HTTP %s: %s", exc.response.status_code, exc.response.text[:300])
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Gemini request failed.") from exc
        except httpx.TimeoutException as exc:
            logger.warning("Gemini timed out (attempt %s/%s)", attempt + 1, attempts)
            if attempt + 1 < attempts:
                delay = min(0.5 * (2 ** attempt), 4.0) * random.uniform(0.75, 1.25)
                if asyncio.get_running_loop().time() - started + delay < retry_budget:
                    await asyncio.sleep(delay)
                    continue
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Gemini is temporarily unavailable.",
                headers={"Retry-After": "5"},
            ) from exc
        except httpx.RequestError as exc:
            logger.warning("Gemini network error (attempt %s/%s): %s", attempt + 1, attempts, exc)
            if attempt + 1 < attempts:
                delay = min(0.5 * (2 ** attempt), 4.0) * random.uniform(0.75, 1.25)
                if asyncio.get_running_loop().time() - started + delay < retry_budget:
                    await asyncio.sleep(delay)
                    continue
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Gemini is temporarily unavailable.",
                headers={"Retry-After": "5"},
            ) from exc
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
