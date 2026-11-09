"""Session answers graded against the stored question (POST /review/session/{id}/answers)."""

from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.schemas.review import (
    ExerciseKey,
    FlipAnswer,
    PickAnswer,
    RevealAnswer,
    SessionAnswerRequest,
    TypedAnswer,
)
from app.schemas.review_types import QuestionType, ReviewStage
from app.services.review_rules.answers import (
    answer_fits,
    apply_session_answer,
    grade_against_key,
)
from main import app
from tests.review_rules.factories import NOW, card
from tests.review_rules.test_answers_characterization import (
    CARD_ID,
    SESSION_ID,
    UID,
    StubDb,
    card_doc,
)


def key(
    question_type: QuestionType,
    stage: ReviewStage,
    *,
    answer_index: int | None = None,
    accepted: list[str] | None = None,
    answer_kind: str | None = None,
) -> ExerciseKey:
    return ExerciseKey.model_validate(
        {
            "exercise_id": "rs_1-0",
            "flashcard_id": CARD_ID,
            "question_type": question_type,
            "stage": stage,
            "answer_index": answer_index,
            "answer_kind": answer_kind,
            "accepted_answers": accepted or [],
        }
    )


FILL_TRANSLATE = key(
    "fill_text_translate",
    "fill",
    accepted=["meal ticket", "coupon"],
    answer_kind="meaning",
)
FILL_READING = key(
    "fill_text_reading", "fill", accepted=["しょっけん"], answer_kind="kana"
)
MCQ = key("mcq_text_reading", "mcq", answer_index=2)
FLASHCARD = key("flashcard_text", "flashcard")


class TestGradeAgainstKey:
    def test_pick_is_right_only_at_the_stored_index(self) -> None:
        assert grade_against_key(
            MCQ, PickAnswer(kind="pick", exercise_id="x", index=2)
        ) == (True, None)
        assert grade_against_key(
            MCQ, PickAnswer(kind="pick", exercise_id="x", index=0)
        ) == (False, None)

    def test_typed_is_graded_against_the_stored_answers(self) -> None:
        def typed(text: str) -> SessionAnswerRequest:
            return TypedAnswer(kind="typed", exercise_id="x", text=text)

        assert grade_against_key(FILL_TRANSLATE, typed("Coupon"))[0] is True
        assert grade_against_key(FILL_TRANSLATE, typed("the meal ticket"))[0] is True
        assert grade_against_key(FILL_TRANSLATE, typed("ticket"))[0] is False
        assert grade_against_key(FILL_READING, typed("ショッケン"))[0] is True
        # A reading answer in kanji or romaji is wrong.
        assert grade_against_key(FILL_READING, typed("食券"))[0] is False
        assert grade_against_key(FILL_READING, typed("shokken"))[0] is False

    def test_reveal_is_a_miss(self) -> None:
        assert grade_against_key(
            FILL_READING, RevealAnswer(kind="reveal", exercise_id="x")
        ) == (
            False,
            None,
        )

    def test_flip_uses_the_learners_rating(self) -> None:
        assert grade_against_key(
            FLASHCARD, FlipAnswer(kind="flip", exercise_id="x", rating="easy")
        ) == (
            True,
            "easy",
        )
        assert grade_against_key(
            FLASHCARD, FlipAnswer(kind="flip", exercise_id="x", rating="again")
        ) == (False, "again")

    @pytest.mark.parametrize(
        ("k", "answer", "fits"),
        [
            (FLASHCARD, FlipAnswer(kind="flip", exercise_id="x", rating="good"), True),
            (FLASHCARD, PickAnswer(kind="pick", exercise_id="x", index=0), False),
            (MCQ, PickAnswer(kind="pick", exercise_id="x", index=0), True),
            (MCQ, TypedAnswer(kind="typed", exercise_id="x", text="a"), False),
            (MCQ, RevealAnswer(kind="reveal", exercise_id="x"), False),
            (FILL_READING, TypedAnswer(kind="typed", exercise_id="x", text="a"), True),
            (FILL_READING, RevealAnswer(kind="reveal", exercise_id="x"), True),
            (
                FILL_READING,
                FlipAnswer(kind="flip", exercise_id="x", rating="good"),
                False,
            ),
        ],
    )
    def test_answer_kind_must_fit_the_question(
        self, k: ExerciseKey, answer: SessionAnswerRequest, fits: bool
    ) -> None:
        assert answer_fits(k, answer) is fits


class TestApplySessionAnswer:
    def test_grades_against_the_key_not_the_cards_current_synonyms(self) -> None:
        # The card no longer lists "coupon", but the question as asked accepted it.
        c = card("fc_1", stage="fill", strength=4, meaning="meal ticket")
        answer = TypedAnswer(kind="typed", exercise_id="x", text="coupon")
        outcome = apply_session_answer(c, FILL_TRANSLATE, answer, NOW)
        assert outcome.correct is True and outcome.stale is False
        assert outcome.stats.stage_streak == 1

    def test_stage_changed_since_the_question_was_asked_is_stale(self) -> None:
        c = card("fc_1", stage="fill", strength=4)
        outcome = apply_session_answer(
            c, MCQ, PickAnswer(kind="pick", exercise_id="x", index=2), NOW
        )
        assert outcome.correct is True
        assert outcome.stale is True
        assert outcome.event is None
        assert (outcome.strength, outcome.stats) == (4, c.review_stats)

    def test_reveal_counts_as_a_miss(self) -> None:
        c = card("fc_1", stage="fill", strength=4)
        outcome = apply_session_answer(
            c, FILL_READING, RevealAnswer(kind="reveal", exercise_id="x"), NOW
        )
        assert outcome.correct is False
        assert outcome.strength == 3
        assert outcome.stats.miss_streak == 1

    def test_flip_rating_sets_the_strength(self) -> None:
        c = card("fc_1", stage="flashcard", strength=1)
        outcome = apply_session_answer(
            c, FLASHCARD, FlipAnswer(kind="flip", exercise_id="x", rating="easy"), NOW
        )
        assert outcome.strength == 3


URL = f"{settings.API_V1_STR}/review/session/{SESSION_ID}/answers"


@pytest.fixture
def stub_db() -> Any:
    db = StubDb(card_doc(strength=2, stage="mcq"))
    db.docs[("users", UID, "review_sessions", SESSION_ID)] = {
        "session_id": SESSION_ID,
        "flashcard_ids": [CARD_ID],
        "started_at": datetime(2026, 11, 1, tzinfo=UTC),
        "answers": [],
        "exercises": [MCQ.model_dump(mode="python")],
    }
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: {"uid": UID}
    yield db
    app.dependency_overrides.clear()


class TestAnswerEndpoint:
    def test_right_pick_is_recorded(self, stub_db: StubDb) -> None:
        resp = TestClient(app).post(
            URL, json={"kind": "pick", "exercise_id": "rs_1-0", "index": 2}
        )
        assert resp.status_code == 200
        assert resp.json() == {"exercise_id": "rs_1-0", "correct": True, "stale": False}
        (card_write,) = stub_db.writes_to("flashcards")
        assert card_write["strength"] == 3
        (session_write,) = stub_db.writes_to("review_sessions")
        (answer,) = session_write["answers"].values
        assert answer["correct"] is True

    def test_stale_answer_is_flagged_and_not_counted(self, stub_db: StubDb) -> None:
        stub_db.docs[("users", UID, "flashcards", CARD_ID)] = card_doc(
            strength=4, stage="fill"
        )
        resp = TestClient(app).post(
            URL, json={"kind": "pick", "exercise_id": "rs_1-0", "index": 2}
        )
        assert resp.status_code == 200
        assert resp.json()["stale"] is True
        assert stub_db.writes_to("flashcards") == []

    def test_unknown_exercise_is_404(self, stub_db: StubDb) -> None:
        resp = TestClient(app).post(
            URL, json={"kind": "pick", "exercise_id": "nope", "index": 0}
        )
        assert resp.status_code == 404

    def test_session_without_keys_is_409(self, stub_db: StubDb) -> None:
        stub_db.docs[("users", UID, "review_sessions", SESSION_ID)]["exercises"] = []
        resp = TestClient(app).post(
            URL, json={"kind": "pick", "exercise_id": "rs_1-0", "index": 0}
        )
        assert resp.status_code == 409
        assert stub_db.updates == []

    def test_answer_kind_that_doesnt_fit_is_422(self, stub_db: StubDb) -> None:
        resp = TestClient(app).post(
            URL, json={"kind": "typed", "exercise_id": "rs_1-0", "text": "x"}
        )
        assert resp.status_code == 422
        assert stub_db.updates == []

    @pytest.mark.parametrize(
        "body",
        [
            {"exercise_id": "rs_1-0", "index": 0},
            {"kind": "guess", "exercise_id": "rs_1-0"},
            {"kind": "pick", "exercise_id": "rs_1-0", "index": -1},
            {"kind": "pick", "exercise_id": "rs_1-0"},
            {"kind": "flip", "exercise_id": "rs_1-0", "rating": "great"},
        ],
    )
    def test_malformed_body_is_422(self, stub_db: StubDb, body: dict[str, Any]) -> None:
        assert TestClient(app).post(URL, json=body).status_code == 422
        assert stub_db.updates == []
