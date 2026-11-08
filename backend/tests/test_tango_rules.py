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
