"""Prepare briefing: what to expect at a place, Tango to know, tips from other learners.

One Places Details call (reviews) + one Gemini call per place and language,
cached in places/{id}/briefing/{language} and shared by everyone.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError
from google.cloud.firestore import AsyncClient

from app.core.config import settings
from app.schemas.place import Place
from app.schemas.prepare import BriefingContent, BriefingResponse, HistoryTip
from app.services import places
from app.services.firestore import FLASHCARDS_SUBCOLLECTION, USERS_COLLECTION, make_flashcard_id
from app.services.gemini import generate_json, jp_schema
from app.services.rehearsal_rules import parse_briefing

logger = logging.getLogger(__name__)

CACHE_TTL = timedelta(days=7)
MAX_REVIEWS = 5
REVIEW_CHARS = 300
MAX_TIPS = 5
TIPS_COLLECTION = "tips"

BRIEFING_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "steps": {"type": "ARRAY", "items": {"type": "STRING"}},
        "tango": {"type": "ARRAY", "items": jp_schema()},
        "source": {"type": "STRING"},
    },
    "required": ["steps", "tango", "source"],
}


def _cache_ref(db: AsyncClient, place_id: str, language: str) -> Any:
    return db.collection(places.PLACES_COLLECTION).document(place_id).collection("briefing").document(language.lower())


async def _reviews(http: httpx.AsyncClient, place: Place) -> list[str]:
    """Up to 5 short review texts, or [] for built-in places / no key / errors."""
    if not settings.GOOGLE_PLACES_API_KEY or place.id.startswith("builtin:"):
        return []
    try:
        data = await places._call(http, "GET", f"places/{place.id}", "reviews", "en")
    except Exception:
        logger.warning("Could not load reviews for %s; briefing without them", place.id)
        return []
    texts = [((r.get("text") or {}).get("text") or "").strip() for r in data.get("reviews", [])]
    return [t[:REVIEW_CHARS] for t in texts if t][:MAX_REVIEWS]


def _prompt(place: Place, reviews: list[str], language: str) -> str:
    review_block = "\n".join(f"- {r}" for r in reviews) if reviews else "(no reviews available)"
    return (
        "You prepare a Japanese learner for a first visit to a place in Japan.\n"
        f"Place: {place.name.text} ({place.name.meaning or ''}), {place.category}, {place.address or place.area}.\n"
        f"Recent visitor reviews:\n{review_block}\n\n"
        f"Write in {language}:\n"
        "- steps: exactly 3 short sentences on what happens during a visit, in order "
        "(how to order or check in, how to pay, anything unusual). Use the reviews when they say "
        "something concrete (ticket machine, cash only, queue outside); otherwise describe what is "
        "typical for this kind of place. No made-up specifics.\n"
        "- tango: 4 Japanese words or short phrases the learner will likely see or hear there, "
        "each with hiragana reading, Hepburn romaji and meaning.\n"
        "- source: one short line saying what this is based on, e.g. 'Based on Google reviews' "
        "or 'Typical for ramen shops'."
    )


async def _content(db: AsyncClient, http: httpx.AsyncClient, place: Place, language: str) -> BriefingContent:
    ref = _cache_ref(db, place.id, language)
    try:
        snap = await ref.get()
        if snap.exists:
            cached = BriefingContent.model_validate(snap.to_dict())
            fresh = cached.generated_at and datetime.now(timezone.utc) - cached.generated_at < CACHE_TTL
            if fresh:
                return cached
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Briefing cache read failed for %s", place.id)

    raw = await generate_json(
        http=http, prompt=_prompt(place, await _reviews(http, place), language), schema=BRIEFING_SCHEMA
    )
    content = parse_briefing(raw).model_copy(update={"generated_at": datetime.now(timezone.utc)})
    try:
        await ref.set(content.model_dump(mode="python"))
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Briefing cache write failed for %s", place.id)
    return content


async def _mark_owned(db: AsyncClient, uid: str, content: BriefingContent) -> BriefingContent:
    ids = [make_flashcard_id(uid, t.text) for t in content.tango]
    refs = [db.collection(USERS_COLLECTION).document(uid).collection(FLASHCARDS_SUBCOLLECTION).document(i) for i in ids]
    owned: set[str] = set()
    try:
        async for snap in db.get_all(refs):
            if snap.exists:
                owned.add(snap.id)
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Owned-Tango lookup failed for uid=%s", uid)
    tango = [t.model_copy(update={"flashcard_id": i if i in owned else None}) for t, i in zip(content.tango, ids)]
    return content.model_copy(update={"tango": tango})


async def _tips(db: AsyncClient, place_id: str) -> list[HistoryTip]:
    """Anonymous tips for this place (read-only for now)."""
    query = db.collection(TIPS_COLLECTION).where("place_id", "==", place_id).limit(MAX_TIPS)
    try:
        return [HistoryTip.model_validate({**(d.to_dict() or {}), "id": d.id}) async for d in query.stream()]
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Tips read failed for %s", place_id)
        return []


async def get_briefing(
    *, db: AsyncClient, http: httpx.AsyncClient, uid: str, place_id: str, language: str
) -> BriefingResponse:
    place = await places.get_place(http=http, db=db, place_id=place_id)
    content = await _mark_owned(db, uid, await _content(db, http, place, language))
    return BriefingResponse(
        place=place,
        steps=content.steps,
        tango=content.tango,
        tips=await _tips(db, place.id),
        source=content.source or "Prepared by Gemini",
    )
