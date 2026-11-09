from datetime import datetime, timezone

import pytest

from app.services import tango_rules as rules

NOW = datetime(2026, 11, 8, 12, 0, tzinfo=timezone.utc)


class TestIdentity:
    def test_same_word_same_card(self) -> None:
        assert rules.make_flashcard_id("u1", "食券") == rules.make_flashcard_id("u1", "食券")

    def test_whitespace_and_case_do_not_matter(self) -> None:
        assert rules.make_flashcard_id("u1", "  Ramen ") == rules.make_flashcard_id("u1", "ramen")

    def test_full_and_half_width_are_the_same_word(self) -> None:
        # NFKC: full-width ＡＢＣ and half-width katakana fold to the usual forms.
        assert rules.make_flashcard_id("u1", "ＡＢＣ") == rules.make_flashcard_id("u1", "abc")
        assert rules.make_flashcard_id("u1", "ﾃﾚﾋﾞ") == rules.make_flashcard_id("u1", "テレビ")

    def test_different_users_get_different_cards(self) -> None:
        assert rules.make_flashcard_id("u1", "食券") != rules.make_flashcard_id("u2", "食券")

    def test_different_words_get_different_cards(self) -> None:
        assert rules.make_flashcard_id("u1", "食券") != rules.make_flashcard_id("u1", "替え玉")

    def test_id_format(self) -> None:
        card_id = rules.make_flashcard_id("u1", "食券")
        assert card_id.startswith("fc_")
        assert len(card_id) == len("fc_") + 20


class TestStrength:
    @pytest.mark.parametrize(
        ("start", "rating", "expected"),
        [
            (0, "good", 1),
            (1, "easy", 3),
            (2, "again", 1),
            (0, "again", 0),  # floor
            (3, "easy", 4),  # cap
            (4, "good", 4),  # cap
        ],
    )
    def test_review(self, start: int, rating: str, expected: int) -> None:
        assert rules.apply_review(start, rating) == expected  # type: ignore[arg-type]

    def test_sighting_adds_one_up_to_four(self) -> None:
        assert rules.apply_sighting(0) == 1
        assert rules.apply_sighting(3) == 4
        assert rules.apply_sighting(4) == 4

    def test_mastered_only_at_four(self) -> None:
        assert not rules.is_mastered(3)
        assert rules.is_mastered(4)


class TestRecords:
    def test_new_sighting_defaults(self) -> None:
        sighting = rules.new_sighting(now=NOW, capture_id="cap_1")
        assert sighting.sighting_id.startswith("st_")
        assert sighting.place_name == ""
        assert sighting.seen_at == NOW

    def test_new_sightings_have_unique_ids(self) -> None:
        a = rules.new_sighting(now=NOW, capture_id="cap_1")
        b = rules.new_sighting(now=NOW, capture_id="cap_1")
        assert a.sighting_id != b.sighting_id

    def test_history_event_links_sighting(self) -> None:
        event = rules.history_event(
            now=NOW, type="caught", sighting_id="st_x", strength_after=0
        )
        assert event.sighting_id == "st_x"
        assert event.type == "caught"


class TestSightingCooldown:
    def test_first_sighting_always_boosts(self) -> None:
        assert rules.can_increase_strength_from_sighting([], new_place_id="place_1", now=NOW) is True

    def test_rapid_sighting_blocked_regardless_of_place(self) -> None:
        s1 = rules.new_sighting(now=NOW, capture_id="c1", place_id="place_1")
        # 1 minute later at different place:
        now_plus_1m = datetime(2026, 11, 8, 12, 1, tzinfo=timezone.utc)
        assert rules.can_increase_strength_from_sighting([s1], new_place_id="place_2", now=now_plus_1m) is False

    def test_same_place_within_1_hour_blocked(self) -> None:
        s1 = rules.new_sighting(now=NOW, capture_id="c1", place_id="place_1")
        # 30 minutes later at same place:
        now_plus_30m = datetime(2026, 11, 8, 12, 30, tzinfo=timezone.utc)
        assert rules.can_increase_strength_from_sighting([s1], new_place_id="place_1", now=now_plus_30m) is False

    def test_different_place_after_5_minutes_allowed(self) -> None:
        s1 = rules.new_sighting(now=NOW, capture_id="c1", place_id="place_1")
        # 10 minutes later at different place:
        now_plus_10m = datetime(2026, 11, 8, 12, 10, tzinfo=timezone.utc)
        assert rules.can_increase_strength_from_sighting([s1], new_place_id="place_2", now=now_plus_10m) is True

    def test_same_place_after_1_hour_allowed(self) -> None:
        s1 = rules.new_sighting(now=NOW, capture_id="c1", place_id="place_1")
        # 65 minutes later at same place:
        now_plus_65m = datetime(2026, 11, 8, 13, 5, tzinfo=timezone.utc)
        assert rules.can_increase_strength_from_sighting([s1], new_place_id="place_1", now=now_plus_65m) is True

    def test_sighting_with_default_now_does_not_raise(self) -> None:
        s1 = rules.new_sighting(now=NOW, capture_id="c1", place_id="place_1")
        # now=None exercises datetime.now(timezone.utc)
        result = rules.can_increase_strength_from_sighting([s1], new_place_id="place_2")
        assert isinstance(result, bool)
