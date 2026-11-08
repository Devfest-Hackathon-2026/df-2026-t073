"""Staff voice for rehearsals: Google Cloud Text-to-Speech, cached in Cloud Storage.

Each (text, voice, speed) is synthesized once; later requests return the stored
file's download URL without calling the API again.
"""

import base64
import logging
from urllib.parse import quote

import anyio
import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.firebase import get_gcp_access_token, get_storage_client
from app.schemas.rehearsal import Speed
from app.services.rehearsal_rules import TTS_RATE, TTS_VOICE, tts_cache_key
from app.services.storage import _resolve_bucket_name, _upload_blob_sync

logger = logging.getLogger(__name__)

TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"


def _existing_url_sync(bucket_name: str, path: str) -> str | None:
    blob = get_storage_client().bucket(bucket_name).blob(path)
    if not blob.exists():
        return None
    blob.reload()
    token = (blob.metadata or {}).get("firebaseStorageDownloadTokens")
    if not token:
        return None
    return f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/{quote(path, safe='')}?alt=media&token={token}"


async def staff_audio_url(*, http: httpx.AsyncClient, text: str, speed: Speed) -> str:
    bucket = _resolve_bucket_name()
    path = tts_cache_key(text, speed)
    cached = await anyio.to_thread.run_sync(lambda: _existing_url_sync(bucket, path))
    if cached:
        return cached

    headers = {"Authorization": f"Bearer {await get_gcp_access_token()}"}
    if settings.FIREBASE_PROJECT_ID:
        headers["x-goog-user-project"] = settings.FIREBASE_PROJECT_ID
    body = {
        "input": {"text": text},
        "voice": {"languageCode": "ja-JP", "name": TTS_VOICE},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": TTS_RATE[speed]},
    }
    try:
        resp = await http.post(TTS_URL, headers=headers, json=body)
        resp.raise_for_status()
        audio = base64.b64decode(resp.json()["audioContent"])
    except httpx.HTTPStatusError as exc:
        logger.error("Text-to-Speech returned HTTP %s: %s", exc.response.status_code, exc.response.text[:300])
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Text-to-speech failed.") from exc
    except Exception as exc:
        logger.exception("Text-to-Speech failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Text-to-speech failed.") from exc

    return await anyio.to_thread.run_sync(lambda: _upload_blob_sync(bucket, path, audio, "audio/mpeg"))
