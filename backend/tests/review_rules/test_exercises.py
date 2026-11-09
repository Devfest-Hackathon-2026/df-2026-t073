import pytest

from app.schemas.capture import Vertex
from app.schemas.flashcard import (
    Distractors,
    JpOption,
)
from app.schemas.review import (
    FillBlankExercise,
    FlashcardExercise,
    McqExercise,
)
from app.services.review_rules.distractors import complete_distractors
from app.services.review_rules.exercises import build_exercise, gap_from_bbox
from app.services.review_rules.results import exercise_types_summary
from tests.review_rules.factories import card


class TestExercises:
    def test_flashcard_exercise_shows_photo_for_text_and_object(self) -> None:
        txt = card("t", stage="flashcard", image=True)
        obj = card("o", capture_format="object", stage="flashcard", image=True)
        d = complete_distractors(txt, None, [])
        ex_txt = build_exercise(txt, d, 0, "rs")
        ex_obj = build_exercise(obj, d, 1, "rs")
        assert isinstance(ex_txt, FlashcardExercise)
        assert ex_txt.question_type == "flashcard_text"
        assert ex_txt.photo is not None
        assert ex_txt.front is not None and ex_txt.front.text == "食券"
        assert isinstance(ex_obj, FlashcardExercise)
        assert ex_obj.question_type == "flashcard_object"
        assert ex_obj.photo is not None
        assert ex_obj.front is None

    def test_mcq_photo_vs_plain_text_and_object(self) -> None:
        c_photo = card("p", stage="mcq_photo", image=True)
        c_plain = card(
            "t", stage="mcq", image=True, last_question_type="mcq_text_reading"
        )
        c_obj = card("o", capture_format="object", stage="mcq", image=True)
        d = complete_distractors(c_photo, None, [])

        ex_photo = build_exercise(c_photo, d, 0, "rs")
        assert isinstance(ex_photo, McqExercise)
        assert ex_photo.question_type == "mcq_text_translate"
        assert ex_photo.photo is not None
        assert ex_photo.options[ex_photo.answer_index] == "meal ticket"
        assert len(set(ex_photo.options)) == 4

        ex_plain = build_exercise(c_plain, d, 1, "rs")
        assert isinstance(ex_plain, McqExercise)
        assert ex_plain.photo is None

        ex_obj = build_exercise(c_obj, d, 2, "rs")
        assert isinstance(ex_obj, McqExercise)
        assert ex_obj.question_type == "mcq_object_name"
        assert ex_obj.photo is not None
        correct_opt = ex_obj.options[ex_obj.answer_index]
        assert isinstance(correct_opt, JpOption) and correct_opt.text == "食券"

    def test_fill_blank_plain_text_for_text_and_photo_for_object(self) -> None:
        c_txt = card("t", stage="fill", image=True)
        c_obj = card("o", capture_format="object", stage="fill", image=True)
        d = complete_distractors(c_txt, None, [])

        ex_txt = build_exercise(c_txt, d, 0, "rs")
        assert isinstance(ex_txt, FillBlankExercise)
        assert ex_txt.photo is None
        assert ex_txt.cloze is not None and "＿＿＿" in ex_txt.cloze.japanese
        assert len(ex_txt.accepted_answers) >= 1

        ex_obj = build_exercise(c_obj, d, 1, "rs")
        assert isinstance(ex_obj, FillBlankExercise)
        assert ex_obj.question_type == "fill_object_name"
        assert ex_obj.photo is not None
        assert (
            "食券" in ex_obj.accepted_answers
            and "しょっけん" in ex_obj.accepted_answers
        )

    def test_gap_box_padded_and_clamped(self) -> None:
        box = gap_from_bbox([Vertex(x=0.0, y=0.5), Vertex(x=0.3, y=0.6)])
        assert box.x == 0.0
        assert abs(box.w - 0.32) < 1e-9
        assert abs(box.y - 0.48) < 1e-9

    def test_exercise_types_summary_counts(self) -> None:
        cards = [
            card("a", stage="flashcard"),
            card("b", stage="mcq_photo", image=True),
            card("c", stage="mcq"),
            card("d", stage="fill", strength=4),
        ]
        summary = {t.id: t.count for t in exercise_types_summary(cards)}
        assert summary == {"flashcard": 1, "mcq": 2, "fill": 1}


class TestShortLabels:
    def test_place_hint_is_just_the_area(self) -> None:
        ex = build_exercise(card("a", places=("Koenji",)), Distractors(), 0, "rs")
        assert ex.place_hint == "Koenji"

    def test_no_place_gives_an_empty_hint(self) -> None:
        ex = build_exercise(card("a", places=()), Distractors(), 0, "rs")
        assert ex.place_hint == ""

    @pytest.mark.parametrize(
        ("strength", "label"),
        [(0, "4 to Stamp"), (3, "1 to Stamp"), (4, "Stamp earned")],
    )
    def test_next_step_counts_down_to_a_stamp(self, strength: int, label: str) -> None:
        ex = build_exercise(card("a", strength=strength), Distractors(), 0, "rs")
        assert ex.next_step == label
