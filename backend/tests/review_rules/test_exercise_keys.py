import asyncio
import itertools
from datetime import timedelta
from typing import Any, get_args

import pytest

from app.schemas.flashcard import Distractors, FlashcardResponse, JpOption, TangoKind
from app.schemas.review import (
    FillBlankExercise,
    FlashcardExercise,
    McqExercise,
    ReviewSessionRecord,
)
from app.schemas.review_types import ReviewStage
from app.services import review
from app.services.review_rules.distractors import complete_distractors
from app.services.review_rules.exercises import build_exercise, exercise_key
from app.services.review_rules.grading import check_card_answer, check_fill_answer
from tests.review_rules.factories import NOW, card

DISTRACTORS = Distractors(
    meanings=["exit", "entrance", "receipt"],
    words=[
        JpOption(text="出口", reading="でぐち"),
        JpOption(text="入口", reading="いりぐち"),
        JpOption(text="会計", reading="かいけい"),
    ],
    readings=["しょけん", "しょっきん", "しょうけん"],
)

GRID = list(
    itertools.product(
        get_args(TangoKind),
        [True, False],
        get_args(ReviewStage),
        [False, True],
        ["rs_a", "rs_b", "rs_c", "rs_d"],
    )
)


def grid_card(
    kind: TangoKind, image: bool, stage: ReviewStage, kana_only: bool
) -> FlashcardResponse:
    return card(
        "c",
        kind=kind,
        image=image,
        stage=stage,
        kanji="おしぼり" if kana_only else "食券",
        reading="おしぼり" if kana_only else "しょっけん",
        meaning="meal ticket; food voucher",
        synonyms=["coupon"],
    )


class TestExerciseKey:
    def test_mcq_key_keeps_the_right_option(self) -> None:
        c = card("a", stage="mcq")
        ex = build_exercise(c, DISTRACTORS, 0, "rs")
        assert isinstance(ex, McqExercise)
        key = exercise_key(ex)
        assert (key.exercise_id, key.flashcard_id) == (ex.id, "a")
        assert (key.question_type, key.stage) == (ex.question_type, "mcq")
        assert key.answer_index == ex.answer_index
        assert key.accepted_answers == [] and key.answer_kind is None

    def test_fill_key_keeps_the_accepted_answers(self) -> None:
        c = card("a", stage="fill", strength=4)
        ex = build_exercise(c, DISTRACTORS, 0, "rs")
        assert isinstance(ex, FillBlankExercise)
        key = exercise_key(ex)
        assert key.accepted_answers == ex.accepted_answers
        assert key.answer_kind == ex.answer_kind
        assert key.answer_index is None

    def test_flashcard_key_has_no_answer(self) -> None:
        ex = build_exercise(card("a", stage="flashcard"), DISTRACTORS, 0, "rs")
        assert isinstance(ex, FlashcardExercise)
        key = exercise_key(ex)
        assert key.answer_index is None and key.accepted_answers == []


class TestKeyMatchesServerGrading:
    """The stored key and the server's grading must agree on every right answer."""

    @pytest.mark.parametrize(("kind", "image", "stage", "kana_only", "seed"), GRID)
    def test_right_answers_in_the_key_grade_correct(
        self,
        kind: TangoKind,
        image: bool,
        stage: ReviewStage,
        kana_only: bool,
        seed: str,
    ) -> None:
        c = grid_card(kind, image, stage, kana_only)
        ex = build_exercise(c, complete_distractors(c, DISTRACTORS, []), 0, seed)
        key = exercise_key(ex)
        if isinstance(ex, FillBlankExercise):
            assert key.answer_kind is not None
            assert key.accepted_answers
            for answer in key.accepted_answers:
                assert check_fill_answer(answer, key.accepted_answers, key.answer_kind)
                assert check_card_answer(c, ex.question_type, answer), answer
        elif isinstance(ex, McqExercise):
            assert key.answer_index is not None
            right = ex.options[key.answer_index]
            expected: Any = {
                "mcq_text_reading": c.reading,
                "mcq_text_translate": c.meaning,
            }.get(
                ex.question_type,
                JpOption(text=c.kanji, reading=c.reading, romaji=c.romaji),
            )
            assert right == expected


class TestSessionRecord:
    def test_old_sessions_without_keys_still_load(self) -> None:
        doc = {
            "session_id": "rs",
            "flashcard_ids": ["a"],
            "started_at": NOW,
            "answers": [],
        }
        assert ReviewSessionRecord.model_validate(doc).exercises == []

    def test_keys_survive_a_firestore_round_trip(self) -> None:
        ex = build_exercise(card("a", stage="fill", strength=4), DISTRACTORS, 0, "rs")
        record = ReviewSessionRecord(
            session_id="rs",
            flashcard_ids=["a"],
            started_at=NOW,
            exercises=[exercise_key(ex)],
        )
        assert (
            ReviewSessionRecord.model_validate(record.model_dump(mode="python"))
            == record
        )

    def test_build_session_saves_one_key_per_exercise(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        cards = [
            card("flash", stage="flashcard"),
            card("mcq", stage="mcq", strength=2),
            card("fill", stage="fill", strength=4),
        ]
        saved: list[ReviewSessionRecord] = []

        async def list_flashcards(**_: Any) -> list[FlashcardResponse]:
            return cards

        async def generate_distractors(**_: Any) -> dict[str, Distractors]:
            return {}

        async def save_distractors(**_: Any) -> bool:
            return True

        async def create_review_session(
            *, record: ReviewSessionRecord, **_: Any
        ) -> None:
            saved.append(record)

        monkeypatch.setattr(review, "list_flashcards", list_flashcards)
        monkeypatch.setattr(review, "generate_distractors", generate_distractors)
        monkeypatch.setattr(review, "save_distractors", save_distractors)
        monkeypatch.setattr(review, "create_review_session", create_review_session)
        # All three cards are due.
        for c in cards:
            c.review_stats.next_review_at = NOW - timedelta(days=1)

        response = asyncio.run(
            review.build_session(db=None, http_client=None, uid="u1")  # type: ignore[arg-type]  # both are stubbed out
        )

        (record,) = saved
        assert record.session_id == response.session_id
        assert len(response.exercises) == 3
        assert {e.type for e in response.exercises} == {"flashcard", "mcq", "fill"}
        assert [k.exercise_id for k in record.exercises] == [
            e.id for e in response.exercises
        ]
        assert [k.question_type for k in record.exercises] == [
            e.question_type for e in response.exercises
        ]
