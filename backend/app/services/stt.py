"""Google Cloud Speech-to-Text: verbatim Japanese transcript of a spoken reply.

A dedicated recognizer writes down what it hears; an LLM tends to "fix" unclear
speech into what it expects. Auth is the same service account as TTS (no key).
"""

import base64
import logging
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.firebase import get_gcp_access_token

logger = logging.getLogger(__name__)

LANGUAGE = "ja-JP"
# Chirp 2 (best accuracy) is served from a few regions only; this one is near Japan.
CHIRP_LOCATION = "asia-southeast1"
CHIRP_MODEL = "chirp_2"
V1_URL = "https://speech.googleapis.com/v1/speech:recognize"


def parse_transcript(body: dict[str, Any]) -> str:
    """Joins the top alternative of every result (v1 and v2 share this shape)."""
    parts: list[str] = []
    for result in body.get("results") or []:
        alternatives = result.get("alternatives") or []
        if alternatives:
            parts.append(str(alternatives[0].get("transcript", "")).strip())
    return "".join(p for p in parts if p)


def _disabled(resp: httpx.Response) -> bool:
    return resp.status_code == 403 and "SERVICE_DISABLED" in resp.text


async def transcribe(*, http: httpx.AsyncClient, audio: bytes, mime: str) -> str:
    """Japanese transcript of the recording, or "" if nothing was recognized."""
    project = settings.FIREBASE_PROJECT_ID
    headers = {"Authorization": f"Bearer {await get_gcp_access_token()}"}
    if project:
        headers["x-goog-user-project"] = project
    content = base64.b64encode(audio).decode("ascii")

    try:
        if project:
            url = (
                f"https://{CHIRP_LOCATION}-speech.googleapis.com/v2/projects/{project}"
                f"/locations/{CHIRP_LOCATION}/recognizers/_:recognize"
            )
            body = {
                "config": {
                    "autoDecodingConfig": {},
                    "model": CHIRP_MODEL,
                    "languageCodes": [LANGUAGE],
                    "features": {"enableAutomaticPunctuation": True},
                },
                "content": content,
            }
            resp = await http.post(url, headers=headers, json=body, timeout=30)
            if resp.status_code == 200:
                return parse_transcript(resp.json())
            if _disabled(resp):
                raise _disabled_error()
            logger.warning("Chirp STT failed (%s): %s", resp.status_code, resp.text[:300])

        # Fallback: the standard v1 model. Needs the codec spelled out.
        config: dict[str, Any] = {"languageCode": LANGUAGE, "enableAutomaticPunctuation": True}
        if mime in {"audio/amr-wb", "audio/3gpp"}:
            config.update(encoding="AMR_WB", sampleRateHertz=16000)
        resp = await http.post(
            V1_URL, headers=headers, json={"config": config, "audio": {"content": content}}, timeout=30
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Speech recognition is unreachable.") from exc

    if resp.status_code == 200:
        return parse_transcript(resp.json())
    if _disabled(resp):
        raise _disabled_error()
    logger.error("STT failed (%s): %s", resp.status_code, resp.text[:300])
    raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Speech recognition failed.")


def _disabled_error() -> HTTPException:
    return HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Cloud Speech-to-Text API is not enabled for this project.",
    )
