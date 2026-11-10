"""Shared Gemini call: structured JSON output, optionally with inline audio/images.

Supports Google Gen AI SDK (google-genai) for Gemini Enterprise Agent Platform (GEAP) /
Vertex AI with automatic fallback to Google AI Studio and direct REST protocols.
"""

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

try:
    from google import genai
    from google.genai import types

    _HAS_GENAI_SDK = True
except ImportError:
    genai = None  # type: ignore[assignment]
    types = None  # type: ignore[assignment]
    _HAS_GENAI_SDK = False


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


async def _call_genai_sdk(
    *,
    body: dict[str, Any],
    project: str | None,
    location: str,
    model: str,
    api_key: str | None,
    use_vertex: bool,
) -> Any:
    """Invoke Gemini Enterprise Agent Platform (GEAP) / Vertex AI or AI Studio via google-genai SDK."""
    if not _HAS_GENAI_SDK or genai is None or types is None:
        raise RuntimeError("google-genai SDK is not installed.")

    if use_vertex and project:
        client = genai.Client(
            vertexai=True,
            project=project,
            location=location,
        )
    elif api_key:
        client = genai.Client(
            api_key=api_key,
        )
    else:
        raise ValueError("Neither Vertex AI project nor GEMINI_API_KEY is available.")

    raw_contents = body.get("contents", [])
    raw_config = body.get("generationConfig", {})

    sdk_contents: list[Any] = []
    for item in raw_contents:
        parts_list = item.get("parts", [])
        for p in parts_list:
            if "inlineData" in p:
                mime = p["inlineData"]["mimeType"]
                data = base64.b64decode(p["inlineData"]["data"])
                sdk_contents.append(types.Part.from_bytes(data=data, mime_type=mime))
            elif "text" in p:
                sdk_contents.append(p["text"])

    config = types.GenerateContentConfig(
        temperature=raw_config.get("temperature", 0.2),
        response_mime_type=raw_config.get("responseMimeType", "application/json"),
        response_schema=raw_config.get("responseSchema"),
    )

    response = await client.aio.models.generate_content(
        model=model,
        contents=sdk_contents,
        config=config,
    )

    raw_text = (response.text or "").strip()
    if raw_text.startswith("```"):
        lines = raw_text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw_text = "\n".join(lines).strip()

    return json.loads(raw_text)


async def _call_vertex_ai(
    http: httpx.AsyncClient,
    body: dict[str, Any],
    project: str,
    location: str,
    model: str,
) -> httpx.Response:
    token = await get_gcp_access_token()
    url = (
        f"https://{location}-aiplatform.googleapis.com/v1/"
        f"projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent"
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "x-goog-user-project": project,
    }
    return await http.post(url, headers=headers, json=body)


async def _call_ai_studio(
    http: httpx.AsyncClient,
    body: dict[str, Any],
    api_key: str,
    model: str,
) -> httpx.Response:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    return await http.post(url, headers=headers, json=body)


async def request_json(*, http: httpx.AsyncClient, body: dict[str, Any]) -> Any:
    """Send a prepared structured-output request via Vertex AI (with AI Studio fallback) and retry logic."""
    project = settings.FIREBASE_PROJECT_ID
    location = getattr(settings, "VERTEX_LOCATION", "asia-northeast1")
    model = settings.GEMINI_MODEL
    api_key = settings.GEMINI_API_KEY

    if not project and not api_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Neither FIREBASE_PROJECT_ID (for Vertex AI) nor GEMINI_API_KEY is configured.",
        )

    attempts = max(1, settings.GEMINI_MAX_ATTEMPTS)
    retry_budget = max(0.0, settings.GEMINI_RETRY_BUDGET_S)
    started = asyncio.get_running_loop().time()
    use_vertex = bool(project)

    # 1. Prefer Google Gen AI SDK (google-genai) if installed
    if _HAS_GENAI_SDK:
        for attempt in range(attempts):
            try:
                try:
                    return await _call_genai_sdk(
                        body=body,
                        project=project,
                        location=location,
                        model=model,
                        api_key=api_key,
                        use_vertex=use_vertex,
                    )
                except Exception as sdk_err:
                    if use_vertex and api_key:
                        logger.warning(
                            "Vertex AI SDK call failed (%s); falling back to Google AI Studio with GEMINI_API_KEY: %s",
                            type(sdk_err).__name__,
                            sdk_err,
                        )
                        return await _call_genai_sdk(
                            body=body,
                            project=None,
                            location=location,
                            model=model,
                            api_key=api_key,
                            use_vertex=False,
                        )
                    raise
            except HTTPException:
                raise
            except Exception as exc:
                logger.warning(
                    "Google Gen AI SDK transient error (attempt %s/%s): %s",
                    attempt + 1,
                    attempts,
                    exc,
                )
                if attempt + 1 < attempts:
                    delay = min(0.5 * (2 ** attempt), 4.0) * random.uniform(0.75, 1.25)
                    if asyncio.get_running_loop().time() - started + delay < retry_budget:
                        await asyncio.sleep(delay)
                        continue
                logger.warning("Google Gen AI SDK attempts exhausted; falling back to REST: %s", exc)
                break

    # 2. REST Protocol execution (fallback or when google-genai is not installed)
    for attempt in range(attempts):
        try:
            if use_vertex:
                try:
                    resp = await _call_vertex_ai(http, body, project, location, model)
                except Exception as auth_exc:
                    if api_key:
                        logger.warning(
                            "Vertex AI credentials unavailable (%s); falling back to Google AI Studio",
                            auth_exc,
                        )
                        use_vertex = False
                        resp = await _call_ai_studio(http, body, api_key, model)
                    else:
                        raise HTTPException(
                            status.HTTP_502_BAD_GATEWAY,
                            detail=f"Vertex AI authentication failed: {auth_exc}. Run 'gcloud auth application-default login' for local dev.",
                        ) from auth_exc
            else:
                resp = await _call_ai_studio(http, body, api_key, model)

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

            # If Vertex AI returned 403 (e.g. API disabled or IAM missing) or 404 (model not in region)
            if resp.status_code in (403, 404) and use_vertex and api_key:
                logger.warning(
                    "Vertex AI HTTP %s (%s); falling back to Google AI Studio with GEMINI_API_KEY",
                    resp.status_code,
                    resp.text[:200],
                )
                use_vertex = False
                resp = await _call_ai_studio(http, body, api_key, model)

            if resp.status_code >= 400:
                err_text = resp.text[:400]
                logger.error("Gemini / Vertex AI HTTP %s: %s", resp.status_code, err_text)
                raise HTTPException(
                    status.HTTP_502_BAD_GATEWAY,
                    detail=f"Gemini API HTTP {resp.status_code}: {err_text}",
                )

            candidates = resp.json().get("candidates") or []
            if not candidates:
                raise ValueError(f"Gemini returned no candidates: {resp.text[:300]}")

            raw_text = candidates[0]["content"]["parts"][0]["text"].strip()
            # Strip markdown code blocks if present
            if raw_text.startswith("```"):
                lines = raw_text.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                raw_text = "\n".join(lines).strip()

            return json.loads(raw_text)

        except HTTPException:
            raise
        except (httpx.TimeoutException, httpx.RequestError) as exc:
            logger.warning("Gemini network error (attempt %s/%s): %s", attempt + 1, attempts, exc)
            if attempt + 1 < attempts:
                delay = min(0.5 * (2 ** attempt), 4.0) * random.uniform(0.75, 1.25)
                if asyncio.get_running_loop().time() - started + delay < retry_budget:
                    await asyncio.sleep(delay)
                    continue
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Gemini connection error: {exc}",
                headers={"Retry-After": "5"},
            ) from exc
        except Exception as exc:
            logger.exception("Gemini / Vertex AI call failed")
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                detail=f"Gemini request failed: {type(exc).__name__}: {exc}",
            ) from exc


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
