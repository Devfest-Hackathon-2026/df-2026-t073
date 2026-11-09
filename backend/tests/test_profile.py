from datetime import datetime, timezone

from app.schemas.flashcard import FlashcardResponse, ReviewStats, Sighting
from app.services.profile import DEFAULT_NAME, build_profile, display_name

NOW = datetime(2026, 11, 8, tzinfo=timezone.utc)


def card(card_id: str, strength: int, places: tuple[str, ...]) -> FlashcardResponse:
    return FlashcardResponse(
        flashcard_id=card_id,
        capture_id="cap",
        image_url="",
        kanji="食券",
        reading="しょっけん",
        romaji="shokken",
        meaning="meal ticket",
        part_of_speech="Noun",
        use_cases=[],
        review_stats=ReviewStats(next_review_at=NOW),
        created_at=NOW,
        strength=strength,
        sightings=[Sighting(sighting_id=f"{card_id}{i}", place_name=p, seen_at=NOW) for i, p in enumerate(places)],
    )


def test_chosen_name_wins_over_sign_in_name() -> None:
    assert display_name({"display_name": "Marcus", "name": "M. Token"}) == "Marcus"
    assert display_name({"name": "M. Token"}) == "M. Token"


def test_anonymous_users_get_a_default_name() -> None:
    assert display_name({"name": None}) == DEFAULT_NAME
    assert display_name({"display_name": "   "}) == DEFAULT_NAME


def test_stats_count_tango_stars_and_distinct_places() -> None:
    cards = [
        card("a", 4, ("Koenji", "Nakano")),
        card("b", 1, ("Koenji",)),
        card("c", 0, ("",)),
    ]
    profile = build_profile("u1", {"reading_level": "most"}, cards)
    assert (profile.stats.tango, profile.stats.stars, profile.stats.places) == (3, 1, 2)
    assert profile.reading_level == "most"
    assert profile.name == DEFAULT_NAME
