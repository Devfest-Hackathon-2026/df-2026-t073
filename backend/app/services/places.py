"""Places: search, details and "where am I", via Google Places API (New).

Each lookup asks for Japanese and English names in parallel (the Japanese name
is what learners study; the English one explains it). Places are cached in
Firestore (places/{id}) so details are fetched once. Without
GOOGLE_PLACES_API_KEY, a small built-in list of Tokyo places is used instead.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException, status
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError
from google.cloud.firestore import AsyncClient

from app.core.config import settings
from app.schemas.place import JpName, Place
from app.services import place_rules as rules

logger = logging.getLogger(__name__)

PLACES_URL = "https://places.googleapis.com/v1"
PLACES_COLLECTION = "places"
FIELDS = "id,displayName,location,primaryTypeDisplayName,shortFormattedAddress,addressComponents"
SEARCH_RESULTS = 8
# Search prefers results near the user, within this radius.
SEARCH_BIAS_M = 5000.0
# "Where am I": nearest place within this radius.
NEARBY_RADIUS_M = 120.0
BUILTIN_NEARBY_M = 1500.0


def _has_key() -> bool:
    return bool(settings.GOOGLE_PLACES_API_KEY)


async def _call(
    http: httpx.AsyncClient,
    method: str,
    path: str,
    field_mask: str,
    language: str,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    headers = {
        "X-Goog-Api-Key": settings.GOOGLE_PLACES_API_KEY or "",
        "X-Goog-FieldMask": field_mask,
    }
    url = f"{PLACES_URL}/{path}"
    try:
        if method == "GET":
            resp = await http.get(url, headers=headers, params={"languageCode": language, "regionCode": "JP"})
        else:
            payload = {**(body or {}), "languageCode": language, "regionCode": "JP"}
            resp = await http.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        logger.error("Places API %s %s returned %s: %s", method, path, exc.response.status_code, exc.response.text[:300])
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Places lookup failed.") from exc
    except httpx.HTTPError as exc:
        logger.exception("Places API %s %s failed", method, path)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Places lookup failed.") from exc


def _to_place(ja: dict[str, Any], en: dict[str, Any] | None) -> Place:
    en = en or {}
    ja_name = (ja.get("displayName") or {}).get("text") or ""
    en_name = (en.get("displayName") or {}).get("text") or ""
    loc = ja.get("location") or en.get("location") or {}
    return Place(
        id=ja.get("id") or en.get("id") or "",
        name=JpName(text=ja_name or en_name, meaning=en_name if en_name and en_name != ja_name else None),
        category=(en.get("primaryTypeDisplayName") or {}).get("text", ""),
        area=rules.area_from_components(en.get("addressComponents") or []),
        lat=float(loc.get("latitude", 0.0)),
        lng=float(loc.get("longitude", 0.0)),
        address=en.get("shortFormattedAddress", ""),
    )


def _merge(ja_list: list[dict[str, Any]], en_list: list[dict[str, Any]]) -> list[Place]:
    en_by_id = {p.get("id"): p for p in en_list}
    return [_to_place(p, en_by_id.get(p.get("id"))) for p in ja_list if p.get("id")]


async def _cache_get(db: AsyncClient, place_id: str) -> Place | None:
    try:
        snap = await db.collection(PLACES_COLLECTION).document(place_id).get()
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Place cache read failed for %s", place_id)
        return None
    data = snap.to_dict() if snap.exists else None
    return Place.model_validate(data) if data else None


async def cache_put(db: AsyncClient, places: list[Place]) -> None:
    """Best effort: the cache only saves later lookups."""
    if not places:
        return
    batch = db.batch()
    now = datetime.now(timezone.utc)
    for p in places:
        batch.set(db.collection(PLACES_COLLECTION).document(p.id), {**p.model_dump(mode="python"), "cached_at": now})
    try:
        await batch.commit()
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Place cache write failed")


async def place_facts(db: AsyncClient, place_ids: set[str]) -> dict[str, tuple[str, str]]:
    """(area, category) per place id, from the cache (and the built-in list)."""
    result = {p.id: (p.area, p.category) for p in rules.BUILTIN_PLACES if p.id in place_ids}
    wanted = [pid for pid in place_ids if pid not in result]
    if not wanted:
        return result
    refs = [db.collection(PLACES_COLLECTION).document(pid) for pid in wanted]
    try:
        async for snap in db.get_all(refs):
            data = snap.to_dict() if snap.exists else None
            if data:
                result[snap.id] = (data.get("area") or "", data.get("category") or "")
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Place cache batch read failed")
    return result


async def areas_for(db: AsyncClient, place_ids: set[str]) -> dict[str, str]:
    """Area name per place id, from the cache (and the built-in list)."""
    facts = await place_facts(db, place_ids)
    return {pid: area for pid, (area, _) in facts.items() if area}


async def search_places(
    *, http: httpx.AsyncClient, db: AsyncClient, query: str, lat: float | None, lng: float | None
) -> list[Place]:
    if not query.strip():
        return []
    if not _has_key():
        return rules.search_builtin(rules.BUILTIN_PLACES, query)
    body: dict[str, Any] = {"textQuery": query, "pageSize": SEARCH_RESULTS}
    if lat is not None and lng is not None:
        body["locationBias"] = {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": SEARCH_BIAS_M}}
    mask = ",".join(f"places.{f}" for f in FIELDS.split(","))
    ja, en = await asyncio.gather(
        _call(http, "POST", "places:searchText", mask, "ja", body),
        _call(http, "POST", "places:searchText", mask, "en", body),
    )
    places = _merge(ja.get("places", []), en.get("places", []))
    await cache_put(db, places)
    return places


async def get_place(*, http: httpx.AsyncClient, db: AsyncClient, place_id: str) -> Place:
    builtin = next((p for p in rules.BUILTIN_PLACES if p.id == place_id), None)
    if builtin:
        return builtin
    cached = await _cache_get(db, place_id)
    if cached:
        return cached
    if not _has_key():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Place '{place_id}' not found.")
    ja, en = await asyncio.gather(
        _call(http, "GET", f"places/{place_id}", FIELDS, "ja"),
        _call(http, "GET", f"places/{place_id}", FIELDS, "en"),
    )
    place = _to_place(ja, en)
    await cache_put(db, [place])
    return place


async def nearby_place(*, http: httpx.AsyncClient, db: AsyncClient, lat: float, lng: float) -> Place | None:
    """The place the user is standing at (closest within ~120 m), or None."""
    if not _has_key():
        return rules.nearest_builtin(rules.BUILTIN_PLACES, lat, lng, BUILTIN_NEARBY_M)
    body = {
        "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": NEARBY_RADIUS_M}},
        "maxResultCount": 1,
        "rankPreference": "DISTANCE",
    }
    mask = ",".join(f"places.{f}" for f in FIELDS.split(","))
    ja, en = await asyncio.gather(
        _call(http, "POST", "places:searchNearby", mask, "ja", body),
        _call(http, "POST", "places:searchNearby", mask, "en", body),
    )
    places = _merge(ja.get("places", []), en.get("places", []))
    await cache_put(db, places)
    return places[0] if places else None
