"""Pure rules for Tango (flashcard) identity, strength and history.

No I/O here, so these are unit-tested directly (tests/test_tango_rules.py).
"""

import hashlib
import unicodedata
import uuid
from datetime import datetime
from typing import Literal

from app.schemas.flashcard import HistoryEvent, Sighting

MAX_STRENGTH = 4
REVIEW_DELTA: dict[str, int] = {"again": -1, "good": 1, "easy": 2}
SIGHTING_DELTA = 1


def normalize_word(word: str) -> str:
    """Normalize a word for identity: NFKC (full/half width), trimmed, lowercased."""
    return unicodedata.normalize("NFKC", word).strip().lower()


def make_flashcard_id(uid: str, word: str) -> str:
    """One card per user and word, wherever it was found (A1)."""
    digest = hashlib.sha256(f"{uid}:{normalize_word(word)}".encode("utf-8")).hexdigest()
    return f"fc_{digest[:20]}"


def _clamp(strength: int) -> int:
    return max(0, min(MAX_STRENGTH, strength))


def apply_review(strength: int, rating: Literal["again", "good", "easy"]) -> int:
    """Strength after a review: good +1, easy +2, again -1, kept within 0-4."""
    return _clamp(strength + REVIEW_DELTA[rating])


def apply_sighting(strength: int) -> int:
    """Strength after spotting the Tango again in the real world: +1, max 4."""
    return _clamp(strength + SIGHTING_DELTA)


def is_mastered(strength: int) -> bool:
    """A Tango becomes a Stamp (mastered) at full strength."""
    return strength >= MAX_STRENGTH


# Labels the app shows when it has no real place; never saved as a place name.
PLACEHOLDER_PLACE_NAMES = frozenset(
    {"Location off", "Unknown place", "Finding your place…", "Near you", "In the app"}
)


def clean_place_name(name: str | None) -> str:
    name = (name or "").strip()
    return "" if name in PLACEHOLDER_PLACE_NAMES else name


def new_sighting(
    *,
    now: datetime,
    capture_id: str | None,
    place_id: str | None = None,
    place_name: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    image_url: str | None = None,
) -> Sighting:
    return Sighting(
        sighting_id=f"st_{uuid.uuid4().hex[:12]}",
        capture_id=capture_id,
        place_id=place_id,
        place_name=clean_place_name(place_name),
        lat=lat,
        lng=lng,
        seen_at=now,
        image_url=image_url,
    )


def history_event(
    *,
    now: datetime,
    type: Literal["caught", "reviewed", "seen_again"],
    detail: str = "",
    sighting_id: str | None = None,
    strength_after: int,
) -> HistoryEvent:
    return HistoryEvent(
        type=type,
        at=now,
        detail=detail,
        sighting_id=sighting_id,
        strength_after=strength_after,
    )
