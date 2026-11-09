from app.services.review_rules.questions import pick_question_type
from tests.review_rules.factories import card


class TestQuestionPicking:
    def test_filters_by_format_and_stage(self) -> None:
        assert (
            pick_question_type(card("a", stage="flashcard", image=True))
            == "flashcard_text"
        )
        assert (
            pick_question_type(
                card("b", capture_format="object", stage="flashcard", image=True)
            )
            == "flashcard_object"
        )
        assert (
            pick_question_type(
                card("c", capture_format="object", stage="mcq", image=True)
            )
            == "mcq_object_name"
        )
        assert (
            pick_question_type(
                card("d", capture_format="object", stage="fill", image=True)
            )
            == "fill_object_name"
        )

    def test_mcq_photo_only_asks_translate(self) -> None:
        c = card("a", stage="mcq_photo", image=True)
        for i in range(10):
            assert pick_question_type(c, seed=str(i)) == "mcq_text_translate"

    def test_skips_reading_when_word_is_all_kana(self) -> None:
        hira = card("h", kanji="かえだま", reading="かえだま", stage="mcq")
        kata = card("k", kanji="コーヒー", reading="こーひー", stage="fill")
        for i in range(20):
            assert pick_question_type(hira, seed=str(i)) != "mcq_text_reading"
            assert pick_question_type(kata, seed=str(i)) != "fill_text_reading"

    def test_rotates_away_from_last_question_type(self) -> None:
        for last in ("mcq_text_reading", "mcq_text_translate", "mcq_text_reverse"):
            c = card("a", stage="mcq", last_question_type=last)  # type: ignore[arg-type]
            for i in range(10):
                assert pick_question_type(c, seed=str(i)) != last
