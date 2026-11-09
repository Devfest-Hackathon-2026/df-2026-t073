from datetime import timedelta

from app.services.review_rules.answers import apply_answer
from tests.review_rules.factories import NOW, card


class TestApplyAnswer:
    def test_counted_answer_updates_strength_schedule_stage_and_history(self) -> None:
        c = card("a", strength=2, stage="mcq", stage_streak=2)
        outcome = apply_answer(
            c,
            NOW,
            rating=None,
            correct=True,
            answer_text=None,
            question_type="mcq_text_reading",
        )
        assert outcome.correct is True
        assert outcome.stale is False
        assert outcome.strength == 3
        assert outcome.stats.next_review_at == NOW + timedelta(days=1)
        assert outcome.stats.last_reviewed_at == NOW
        # Third correct MCQ in a row promotes to fill.
        assert outcome.stats.stage == "fill"
        assert outcome.event is not None
        assert outcome.event.at == NOW
        assert outcome.event.detail == "mcq_text_reading"
        assert outcome.event.strength_after == 3

    def test_does_not_change_the_card(self) -> None:
        c = card("a", strength=2, stage="mcq")
        before = c.model_dump()
        apply_answer(
            c,
            NOW,
            rating=None,
            correct=False,
            answer_text=None,
            question_type="mcq_text_reading",
        )
        assert c.model_dump() == before

    def test_stale_answer_is_graded_but_not_counted(self) -> None:
        c = card("a", strength=2, stage="mcq", stage_streak=2)
        outcome = apply_answer(
            c,
            NOW,
            rating="easy",
            correct=True,
            answer_text=None,
            question_type="flashcard_text",
        )
        assert outcome.stale is True
        assert outcome.correct is True
        assert outcome.strength == 2
        assert outcome.stats == c.review_stats
        assert outcome.event is None

    def test_fill_is_graded_from_the_typed_answer(self) -> None:
        c = card("a", strength=4, stage="fill")
        right = apply_answer(
            c,
            NOW,
            rating=None,
            correct=False,
            answer_text="しょっけん",
            question_type="fill_text_reading",
        )
        wrong = apply_answer(
            c,
            NOW,
            rating=None,
            correct=True,
            answer_text="しょけん",
            question_type="fill_text_reading",
        )
        assert (right.correct, right.strength) == (True, 4)
        assert (wrong.correct, wrong.strength) == (False, 3)

    def test_no_question_type_records_the_rating(self) -> None:
        c = card("a", strength=1)
        outcome = apply_answer(
            c, NOW, rating="easy", correct=None, answer_text=None, question_type=None
        )
        assert outcome.strength == 3
        assert outcome.event is not None
        assert outcome.event.detail == "easy"
