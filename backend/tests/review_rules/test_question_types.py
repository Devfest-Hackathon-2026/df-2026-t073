import itertools
from typing import get_args

import pytest

from app.schemas.flashcard import TangoKind
from app.schemas.review_types import QuestionType, ReviewStage
from app.services.review_rules.question_types import QUESTIONS, RATING_WHEN_CORRECT
from app.services.review_rules.questions import pick_question_type
from tests.review_rules.factories import card


class TestQuestionTable:
    def test_every_question_type_has_a_spec(self) -> None:
        assert set(QUESTIONS) == set(get_args(QuestionType))

    def test_every_family_has_a_rating_rule(self) -> None:
        assert {spec.family for spec in QUESTIONS.values()} == set(RATING_WHEN_CORRECT)

    def test_only_fill_questions_have_a_typed_answer(self) -> None:
        for spec in QUESTIONS.values():
            assert (spec.answer_kind is not None) == (spec.family == "fill")

    def test_every_stage_has_a_question(self) -> None:
        covered = {stage for spec in QUESTIONS.values() for stage in spec.stages}
        assert covered == set(get_args(ReviewStage))

    @pytest.mark.parametrize(
        ("kind", "image", "stage", "kana_only"),
        list(
            itertools.product(
                ["word", "object"],
                [True, False],
                get_args(ReviewStage),
                [False, True],
            )
        ),
    )
    def test_every_card_gets_a_question(
        self, kind: TangoKind, image: bool, stage: ReviewStage, kana_only: bool
    ) -> None:
        word = "おしぼり" if kana_only else "食券"
        reading = "おしぼり" if kana_only else "しょっけん"
        c = card("c", kind=kind, image=image, stage=stage, kanji=word, reading=reading)
        assert pick_question_type(c) in QUESTIONS
        assert pick_question_type(c, "seed") in QUESTIONS
