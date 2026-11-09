"""Which cards a session picks: due dates, collections, areas, ordering."""

import math
from datetime import datetime, timezone

from app.schemas.flashcard import (
    FlashcardResponse,
)
from app.schemas.review import ReviewCardResponse
from app.services.review_rules.cards import effective_stage
from app.services.review_rules.stages import STAGE_ORDER
from app.services.tango_rules import clean_place_name

SESSION_SIZE = 10


SECONDS_PER_CARD = 20


PLACE_CUE_COLLECTION = "place-cue"


FAVORITES_COLLECTION = "favorites"


LIST_PREFIX = "list:"


PLACE_PREFIX = "place:"


AREA_PREFIX = "area:"


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def is_due(card: FlashcardResponse, now: datetime) -> bool:
    return _aware(card.review_stats.next_review_at) <= now


def next_due_at(cards: list[FlashcardResponse], now: datetime) -> datetime | None:
    """When the next card comes due, or None if one is due already (or there are none)."""
    upcoming = [_aware(c.review_stats.next_review_at) for c in cards if not is_due(c, now)]
    if not upcoming or len(upcoming) < len(cards):
        return None
    return min(upcoming)


def area_of(card: FlashcardResponse) -> str:
    """The place this Tango was most recently found, or "" if none was named."""
    named = [s for s in card.sightings if clean_place_name(s.place_name)]
    if not named:
        return ""
    return max(named, key=lambda s: _aware(s.seen_at)).place_name


def estimate_minutes(card_count: int) -> int:
    return math.ceil(card_count * SECONDS_PER_CARD / 60) if card_count else 0


def area_id(name: str) -> str:
    """Stable id for an area name, e.g. 'Koenji' -> 'koenji' (matches the Today map)."""
    return name.strip().lower().replace(" ", "-")


def in_collection(
    card: FlashcardResponse,
    collection: str | None,
    area_by_place: dict[str, str] | None = None,
    list_ids: set[str] | None = None,
) -> bool:
    if not collection:
        return True
    if collection == FAVORITES_COLLECTION:
        return card.favorite
    if collection.startswith(LIST_PREFIX):
        return card.flashcard_id in (list_ids or set())
    if collection.startswith(AREA_PREFIX):
        wanted = collection[len(AREA_PREFIX) :]
        areas = area_by_place or {}
        return any(
            area_id(areas.get(s.place_id or "", "") or s.place_name) == wanted
            for s in card.sightings
        )
    if collection == PLACE_CUE_COLLECTION:
        return bool(area_of(card))
    if collection.startswith(PLACE_PREFIX):
        name = collection[len(PLACE_PREFIX) :]
        return any(s.place_name == name for s in card.sightings)
    return False


def pick_session_cards(
    cards: list[FlashcardResponse],
    now: datetime,
    collection: str | None = None,
    limit: int = SESSION_SIZE,
    area_by_place: dict[str, str] | None = None,
    list_ids: set[str] | None = None,
) -> list[FlashcardResponse]:
    """Weakest due cards first.

    Without a collection, only due cards. With a collection (the user chose
    "Review these"), not-yet-due cards fill the rest so practice is always possible.
    """
    chosen = [c for c in cards if in_collection(c, collection, area_by_place, list_ids)]
    due = [c for c in chosen if is_due(c, now)]
    due.sort(key=lambda c: (c.strength, _aware(c.review_stats.next_review_at)))
    if not collection:
        return due[:limit]
    rest = [c for c in chosen if not is_due(c, now)]
    rest.sort(key=lambda c: (c.strength, _aware(c.review_stats.next_review_at)))
    return (due + rest)[:limit]


SAMPLE_SIZE = 4


def build_review_card(
    cards: list[FlashcardResponse], now: datetime
) -> ReviewCardResponse:
    from app.services.review_rules.results import areas_summary

    due = [c for c in cards if is_due(c, now)]
    due.sort(key=lambda c: (c.strength, _aware(c.review_stats.next_review_at)))
    return ReviewCardResponse(
        due_count=len(due),
        minutes=estimate_minutes(min(len(due), SESSION_SIZE)),
        areas=[a.area for a in areas_summary(due)][:3],
        sample=due[:SAMPLE_SIZE],
        more_count=max(0, len(due) - SAMPLE_SIZE),
        next_due_at=next_due_at(cards, now),
    )


def order_session_cards(cards: list[FlashcardResponse]) -> list[FlashcardResponse]:
    """Order session cards easiest to hardest: flashcard -> mcq_photo -> mcq -> fill."""
    return sorted(cards, key=lambda c: STAGE_ORDER[effective_stage(c)])
