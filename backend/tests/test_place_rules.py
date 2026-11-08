from datetime import datetime, timedelta, timezone

from app.schemas.flashcard import FlashcardResponse, ReviewStats, Sighting
from app.schemas.user import HomeArea
from app.services import place_rules as rules

NOW = datetime(2026, 11, 8, tzinfo=timezone.utc)
KOENJI = (35.7052, 139.6497)
NAKANO = (35.7056, 139.6657)


def sighting(sid: str, place_id: str, name: str, at: tuple[float, float] | None, days_ago: int = 0) -> Sighting:
    return Sighting(
        sighting_id=sid,
        place_id=place_id,
        place_name=name,
        lat=at[0] if at else None,
        lng=at[1] if at else None,
        seen_at=NOW - timedelta(days=days_ago),
    )


def card(card_id: str, strength: int, *sightings: Sighting) -> FlashcardResponse:
    return FlashcardResponse(
        flashcard_id=card_id,
        capture_id="cap",
        image_url="",
        kanji=card_id,
        reading="",
        romaji="",
        meaning="",
        part_of_speech="Noun",
        use_cases=[],
        review_stats=ReviewStats(next_review_at=NOW),
        created_at=NOW,
        strength=strength,
        sightings=list(sightings),
    )


class TestAreas:
    def test_direction_suffix_removed(self) -> None:
        assert rules.clean_area("Koenjikita") == "Koenji"
        assert rules.clean_area("Asagayaminami") == "Asagaya"
        assert rules.clean_area("Nakano") == "Nakano"

    def test_short_names_kept(self) -> None:
        assert rules.clean_area("Nishi") == "Nishi"

    def test_component_preference(self) -> None:
        components = [
            {"longText": "Suginami City", "types": ["locality", "political"]},
            {"longText": "Koenjikita", "types": ["sublocality_level_2", "sublocality", "political"]},
        ]
        assert rules.area_from_components(components) == "Koenji"
        assert rules.area_from_components([]) == ""


class TestDistance:
    def test_koenji_to_nakano_is_about_1_4_km(self) -> None:
        assert 1300 < rules.distance_m(*KOENJI, *NAKANO) < 1600

    def test_home_area(self) -> None:
        home = HomeArea(label="Home", lat=KOENJI[0], lng=KOENJI[1], radius_m=500)
        assert rules.in_home_area(KOENJI[0] + 0.001, KOENJI[1], home)  # ~110 m away
        assert not rules.in_home_area(*NAKANO, home)
        assert not rules.in_home_area(None, None, home)
        assert not rules.in_home_area(*KOENJI, None)


class TestBuiltin:
    def test_search_matches_japanese_english_and_area(self) -> None:
        assert [p.id for p in rules.search_builtin(rules.BUILTIN_PLACES, "麺屋")] == ["builtin:menya-taiki"]
        assert {p.area for p in rules.search_builtin(rules.BUILTIN_PLACES, "nakano")} == {"Nakano"}
        assert rules.search_builtin(rules.BUILTIN_PLACES, "  ") == []

    def test_nearest_within_range(self) -> None:
        near = rules.nearest_builtin(rules.BUILTIN_PLACES, 35.7053, 139.6498, max_m=200)
        assert near is not None and near.area == "Koenji"
        assert rules.nearest_builtin(rules.BUILTIN_PLACES, 34.0, 135.0, max_m=200) is None


class TestBuildMap:
    def test_one_pin_per_area_with_counts(self) -> None:
        cards = [
            card("a", 4, sighting("1", "p1", "Koenji Station", KOENJI)),
            card("b", 1, sighting("2", "p1", "Koenji Station", KOENJI), sighting("3", "p2", "Nakano Station", NAKANO)),
        ]
        pins, areas = rules.build_map(cards, {"p1": "Koenji", "p2": "Nakano"}, home=None)
        by_label = {p.label: p for p in pins}
        assert by_label["Koenji"].count == 2 and by_label["Koenji"].stars == 1
        assert by_label["Nakano"].count == 1
        koenji = next(a for a in areas if a.id == "koenji")
        assert koenji.label == "Around Koenji" and koenji.plan_place_id == "p1"

    def test_home_area_and_unlocated_sightings_are_left_out(self) -> None:
        home = HomeArea(label="Home", lat=KOENJI[0], lng=KOENJI[1], radius_m=300)
        cards = [
            card("a", 0, sighting("1", "p1", "Koenji Station", KOENJI)),
            card("b", 0, sighting("2", "", "Somewhere", None)),
            card("c", 0, sighting("3", "p2", "Nakano Station", NAKANO)),
        ]
        pins, _ = rules.build_map(cards, {"p1": "Koenji", "p2": "Nakano"}, home)
        assert [p.label for p in pins] == ["Nakano"]

    def test_falls_back_to_place_name_without_area(self) -> None:
        pins, _ = rules.build_map([card("a", 0, sighting("1", "", "Supermarket, Nakano", NAKANO))], {}, None)
        assert pins[0].label == "Supermarket, Nakano"
