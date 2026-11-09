from app.schemas.capture import Vertex
from app.schemas.flashcard import (
    ReviewStats,
    Sighting,
    card_has_photo,
)
from app.services.review_rules.cards import capture_format
from app.services.review_rules.exercises import backfill_photo_fields
from app.services.review_rules.grading import rating_for_answer
from app.services.review_rules.stages import next_stage, shows_photo, stage_path
from tests.review_rules.factories import NOW, card


class TestFormatAndStages:
    def test_capture_format_stored_and_inferred_from_kind(self) -> None:
        # Older card with no capture_format falls back to kind == 'object'.
        old_obj = card("o", kind="object")
        old_word = card("w", kind="menu_item")
        # Explicit capture_format overrides Gemini's kind (e.g. OCR text labelled 'object').
        ocr_labelled_obj = card("t", kind="object", capture_format="text")
        assert capture_format(old_obj) == "object"
        assert capture_format(old_word) == "text"
        assert capture_format(ocr_labelled_obj) == "text"

    def test_infer_stage_for_old_cards(self) -> None:
        assert card("s0", strength=0, image=True).review_stats.stage == "flashcard"
        assert card("s1", strength=1, image=True).review_stats.stage == "flashcard"
        assert (
            card("s2_text_photo", strength=2, image=True).review_stats.stage
            == "mcq_photo"
        )
        assert (
            card("s2_text_no_photo", strength=2, image=False).review_stats.stage
            == "mcq"
        )
        assert (
            card("s2_obj", strength=2, kind="object", image=True).review_stats.stage
            == "mcq"
        )
        assert card("s3", strength=3, image=True).review_stats.stage == "mcq"
        assert card("s4", strength=4, image=True).review_stats.stage == "fill"

    def test_stage_paths(self) -> None:
        assert stage_path("text", has_photo=True) == (
            "flashcard",
            "mcq_photo",
            "mcq",
            "fill",
        )
        assert stage_path("text", has_photo=False) == ("flashcard", "mcq", "fill")
        assert stage_path("object", has_photo=True) == ("flashcard", "mcq", "fill")

    def test_text_card_promotion_and_demotion(self) -> None:
        stats = ReviewStats(next_review_at=NOW, stage="flashcard")
        # 2 good flashcard reviews -> mcq_photo
        stats = next_stage(stats, "text", True, has_photo=True)
        assert stats.stage == "flashcard" and stats.stage_streak == 1
        stats = next_stage(stats, "text", True, has_photo=True)
        assert stats.stage == "mcq_photo" and stats.stage_streak == 0

        # 2 correct photo MCQs -> plain-text mcq
        stats = next_stage(stats, "text", True, has_photo=True)
        assert stats.stage == "mcq_photo" and stats.stage_streak == 1
        stats = next_stage(stats, "text", True, has_photo=True)
        assert stats.stage == "mcq" and stats.stage_streak == 0

        # 3 correct plain-text MCQs -> fill
        for expected_streak in (1, 2):
            stats = next_stage(stats, "text", True, has_photo=True)
            assert stats.stage == "mcq" and stats.stage_streak == expected_streak
        stats = next_stage(stats, "text", True, has_photo=True)
        assert stats.stage == "fill" and stats.stage_streak == 0

        # 2 wrong in a row at fill -> back to plain-text mcq
        stats = next_stage(stats, "text", False, has_photo=True)
        assert stats.stage == "fill" and stats.miss_streak == 1
        stats = next_stage(stats, "text", False, has_photo=True)
        assert stats.stage == "mcq" and stats.miss_streak == 0

        # 2 wrong in a row at plain-text mcq -> back to mcq_photo
        stats = next_stage(stats, "text", False, has_photo=True)
        stats = next_stage(stats, "text", False, has_photo=True)
        assert stats.stage == "mcq_photo" and stats.miss_streak == 0

    def test_object_card_skips_mcq_photo(self) -> None:
        stats = ReviewStats(next_review_at=NOW, stage="flashcard")
        stats = next_stage(stats, "object", True)
        stats = next_stage(stats, "object", True)
        assert stats.stage == "mcq" and stats.stage_streak == 0
        for _ in range(3):
            stats = next_stage(stats, "object", True)
        assert stats.stage == "fill"
        # 2 misses from mcq on an object card go straight back to flashcard
        stats = ReviewStats(next_review_at=NOW, stage="mcq")
        stats = next_stage(stats, "object", False)
        stats = next_stage(stats, "object", False)
        assert stats.stage == "flashcard"

    def test_no_photo_text_card_skips_mcq_photo(self) -> None:
        stats = ReviewStats(next_review_at=NOW, stage="flashcard")
        stats = next_stage(stats, "text", True, has_photo=False)
        stats = next_stage(stats, "text", True, has_photo=False)
        assert stats.stage == "mcq"

    def test_interrupted_streak_resets(self) -> None:
        stats = ReviewStats(next_review_at=NOW, stage="mcq", stage_streak=2)
        stats = next_stage(stats, "text", False, has_photo=True)
        assert (
            stats.stage == "mcq" and stats.stage_streak == 0 and stats.miss_streak == 1
        )
        stats = next_stage(stats, "text", True, has_photo=True)
        assert (
            stats.stage == "mcq" and stats.stage_streak == 1 and stats.miss_streak == 0
        )

    def test_shows_photo_for_every_stage_and_format(self) -> None:
        # Text Tango with photo: flashcard and mcq_photo show photo; mcq and fill do not.
        assert shows_photo("flashcard", "text", has_photo=True) is True
        assert shows_photo("mcq_photo", "text", has_photo=True) is True
        assert shows_photo("mcq", "text", has_photo=True) is False
        assert shows_photo("fill", "text", has_photo=True) is False
        # Object Tango with photo: always shows photo.
        for s in ("flashcard", "mcq", "fill"):
            assert shows_photo(s, "object", has_photo=True) is True  # type: ignore[arg-type]
        # Without a photo: never shows photo.
        assert shows_photo("flashcard", "text", has_photo=False) is False

    def test_rating_rule(self) -> None:
        assert rating_for_answer("fill_text_translate", True, "good") == "easy"
        assert rating_for_answer("fill_object_name", False, "easy") == "again"
        assert rating_for_answer("mcq_text_reading", True, "easy") == "good"
        assert rating_for_answer("mcq_object_name", False, "good") == "again"
        assert rating_for_answer("flashcard_text", True, "easy") == "easy"
        assert rating_for_answer("flashcard_object", True, "good") == "good"
        assert rating_for_answer("flashcard_text", False, "again") == "again"

    def test_backfill_photo_from_later_sighting(self) -> None:
        live_card = card("live", image=False)
        photo_sighting = Sighting(
            sighting_id="st_photo",
            capture_id="cap_new",
            place_name="Koenji",
            seen_at=NOW,
            image_url="https://example.com/caught.jpg",
        )
        bbox = [Vertex(x=0.2, y=0.2), Vertex(x=0.5, y=0.4)]
        updates = backfill_photo_fields(live_card, photo_sighting, bbox)
        updated = live_card.model_copy(update=updates)
        assert card_has_photo(updated) is True
        assert updated.image_url == "https://example.com/caught.jpg"
        assert updated.capture_id == "cap_new"
        assert len(updated.bounding_box) == 2
