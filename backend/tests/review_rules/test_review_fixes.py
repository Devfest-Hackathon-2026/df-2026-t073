import pytest
from pydantic import ValidationError

from app.schemas.flashcard import (
    Distractors,
    FlashcardReviewRequest,
)
from app.schemas.review import (
    FillBlankExercise,
    FlashcardExercise,
)
from app.services.review_rules.cards import effective_stage
from app.services.review_rules.distractors import (
    complete_distractors,
    needs_distractors,
)
from app.services.review_rules.exercises import build_exercise
from app.services.review_rules.grading import (
    check_card_answer,
    grade_answer,
    merge_synonyms,
)
from app.services.review_rules.questions import is_stale_answer, pick_question_type
from tests.review_rules.factories import card


class TestReviewFixes:
    def test_object_card_without_photo_gets_text_questions(self) -> None:
        obj = card("o", kind="object", stage="flashcard", image=False)
        assert pick_question_type(obj, "seed") == "flashcard_text"
        ex = build_exercise(obj, complete_distractors(obj, None, []), 0, "rs")
        assert isinstance(ex, FlashcardExercise) and ex.front is not None
        obj_mcq = card("o2", kind="object", stage="mcq", image=False)
        assert pick_question_type(obj_mcq, "seed").startswith("mcq_text_")
        obj_photo = card("o3", kind="object", stage="mcq", image=True)
        assert pick_question_type(obj_photo, "seed") == "mcq_object_name"

    def test_answer_alone_never_counts_as_correct(self) -> None:
        c = card("c", stage="mcq")
        assert grade_answer(c, "mcq_text_reading", None, None, "wrong") is False
        assert grade_answer(c, None, None, None, "x") is False
        assert grade_answer(c, "fill_text_reading", True, "good", "しょけん") is False
        assert grade_answer(c, "fill_text_reading", None, None, "しょっけん") is True
        # Fill is always graded by the server, never by the client's flag.
        assert grade_answer(c, "fill_text_reading", True, "easy", None) is False

    def test_request_needs_outcome_unless_fill_answer(self) -> None:
        with pytest.raises(ValidationError):
            FlashcardReviewRequest(answer="x", question_type="mcq_text_reading")
        with pytest.raises(ValidationError):
            FlashcardReviewRequest(answer="x")
        with pytest.raises(ValidationError):
            FlashcardReviewRequest(correct=True, question_type="fill_text_reading")
        FlashcardReviewRequest(answer="x", question_type="fill_text_reading")
        FlashcardReviewRequest(rating="good")

    def test_merge_synonyms(self) -> None:
        assert merge_synonyms(["shut", "Closed"], ["closed", "not open"]) == [
            "shut",
            "Closed",
            "not open",
        ]

    def test_exercise_accepts_only_the_cards_synonyms(self) -> None:
        # The server grades against card.meaning_synonyms, so the exercise must too.
        c = card("c", meaning="closed", synonyms=["shut"], stage="fill", strength=4)
        d = complete_distractors(c, Distractors(synonyms=["not open"]), [])
        for qtype_seed in range(20):
            ex = build_exercise(c, d, 0, f"rs{qtype_seed}")
            if ex.question_type == "fill_text_translate":
                assert isinstance(ex, FillBlankExercise)
                assert "shut" in ex.accepted_answers
                assert "not open" not in ex.accepted_answers
                assert all(
                    check_card_answer(c, ex.question_type, a)
                    for a in ex.accepted_answers
                )
                break
        else:
            pytest.fail("fill_text_translate never picked")

    def test_gloss_of_this_card_is_never_a_wrong_option(self) -> None:
        a = card("a", meaning="toilet/restroom")
        b = card("b", meaning="restroom")
        c2 = card("c", meaning="on/off switch")
        d_on = card("d", meaning="on")
        d = complete_distractors(a, None, [a, b])
        assert "restroom" not in d.meanings
        # Wider than acceptance: "on" is not accepted but is still kept out of the options.
        assert "on" not in complete_distractors(c2, None, [c2, d_on]).meanings

    def test_needs_distractors(self) -> None:
        assert needs_distractors(card("a")) is True
        no_readings = Distractors(meanings=["x"], readings=[])
        kanji = card("k").model_copy(update={"distractors": no_readings})
        assert needs_distractors(kanji) is True
        kana = card("n", kanji="おしぼり", reading="おしぼり").model_copy(
            update={"distractors": no_readings}
        )
        assert needs_distractors(kana) is False
        obj = card("o", kind="object", image=True).model_copy(
            update={"distractors": no_readings}
        )
        assert needs_distractors(obj) is False

    def test_stale_question_detection(self) -> None:
        c = card("c", stage="mcq", image=True)
        assert is_stale_answer(c, "flashcard_text") is True
        assert is_stale_answer(c, "fill_text_reading") is True
        assert is_stale_answer(c, "mcq_text_reading") is False
        assert is_stale_answer(c, "mcq_text_translate") is False
        assert is_stale_answer(c, None) is False
        photo_mcq = card("p", stage="mcq_photo", image=True)
        assert is_stale_answer(photo_mcq, "mcq_text_translate") is False
        assert is_stale_answer(photo_mcq, "mcq_text_reading") is True

    def test_photo_backfill_keeps_mcq_progress(self) -> None:
        # mcq_photo is easier than mcq, so a card already at mcq stays there.
        c = card("c", stage="mcq", image=True)
        assert effective_stage(c) == "mcq"
