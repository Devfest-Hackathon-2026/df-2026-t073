"""Pins down how one review answer is recorded (firestore.update_flashcard_review).

Written before the restructure moves this logic out of the Firestore module, so the
move can be checked against unchanged behavior. Firestore is replaced by a small stub
that serves one card document and records every write.
"""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import HTTPException
from google.api_core.exceptions import ServiceUnavailable
from google.cloud.firestore import ArrayUnion

from app.schemas.flashcard import FlashcardResponse, QuestionType, ReviewStage
from app.services import firestore

UID = "u1"
CARD_ID = "fc_1"
SESSION_ID = "rs_1"


class _Snapshot:
    def __init__(self, data: dict[str, Any] | None) -> None:
        self._data = data
        self.exists = data is not None

    def to_dict(self) -> dict[str, Any] | None:
        return self._data


class _Ref:
    """Follows db.collection(..).document(..) chains and records writes by path."""

    def __init__(self, db: "StubDb", path: tuple[str, ...] = ()) -> None:
        self._db = db
        self._path = path

    def collection(self, name: str) -> "_Ref":
        return _Ref(self._db, (*self._path, name))

    def document(self, name: str) -> "_Ref":
        return _Ref(self._db, (*self._path, name))

    async def get(self) -> _Snapshot:
        return _Snapshot(self._db.docs.get(self._path))

    async def update(self, data: dict[str, Any]) -> None:
        if self._db.fail_updates:
            raise ServiceUnavailable("down")
        self._db.updates.append((self._path[-2], data))


class StubDb(_Ref):
    def __init__(self, card_doc: dict[str, Any]) -> None:
        self.docs: dict[tuple[str, ...], dict[str, Any]] = {
            ("users", UID, "flashcards", CARD_ID): card_doc
        }
        self.updates: list[tuple[str, dict[str, Any]]] = []
        self.fail_updates = False
        super().__init__(self)

    def writes_to(self, collection: str) -> list[dict[str, Any]]:
        return [data for coll, data in self.updates if coll == collection]


def card_doc(
    *,
    strength: int = 0,
    stage: ReviewStage | None = None,
    stage_streak: int = 0,
    miss_streak: int = 0,
    photo: bool = False,
    kind: str = "word",
) -> dict[str, Any]:
    """A stored flashcard document, as Firestore returns it."""
    now = datetime(2026, 11, 1, tzinfo=UTC)
    return {
        "flashcard_id": CARD_ID,
        "capture_id": "cap" if photo else "",
        "image_url": "https://example.com/p.jpg" if photo else "",
        "bounding_box": [{"x": 0.4, "y": 0.4}, {"x": 0.6, "y": 0.5}] if photo else [],
        "kanji": "食券",
        "reading": "しょっけん",
        "romaji": "shokken",
        "meaning": "meal ticket",
        "part_of_speech": "Noun",
        "kind": kind,
        "use_cases": [],
        "review_stats": {
            "next_review_at": now,
            "stage": stage,
            "stage_streak": stage_streak,
            "miss_streak": miss_streak,
        },
        "created_at": now,
        "strength": strength,
        "sightings": [
            {"sighting_id": "s0", "place_name": "Koenji", "seen_at": now},
        ],
    }


def review(
    db: StubDb,
    *,
    question_type: QuestionType | None,
    correct: bool | None = None,
    rating: firestore.Rating | None = None,
    answer: str | None = None,
    session_id: str | None = None,
) -> FlashcardResponse:
    return asyncio.run(
        firestore.update_flashcard_review(
            db=db,  # type: ignore[arg-type]  # stub stands in for AsyncClient
            uid=UID,
            flashcard_id=CARD_ID,
            rating=rating,
            correct=correct,
            answer_text=answer,
            question_type=question_type,
            session_id=session_id,
        )
    )


def only_card_write(db: StubDb) -> dict[str, Any]:
    writes = db.writes_to("flashcards")
    assert len(writes) == 1
    return writes[0]


def due_after(card: Any) -> timedelta:
    stats = card.review_stats
    return stats.next_review_at - stats.last_reviewed_at


class TestRatingStrengthAndSchedule:
    def test_correct_mcq_is_good(self) -> None:
        db = StubDb(card_doc(strength=2, stage="mcq"))
        card = review(db, question_type="mcq_text_reading", correct=True, rating="easy")
        # MCQ is always "good" (client rating ignored): +1 strength, first review due in 1 day.
        assert card.strength == 3
        assert due_after(card) == timedelta(days=1)
        assert card.review_stats.review_count == 1
        assert card.review_stats.stage_streak == 1
        assert card.review_stats.last_question_type == "mcq_text_reading"

    def test_wrong_mcq_is_again(self) -> None:
        db = StubDb(card_doc(strength=2, stage="mcq"))
        card = review(db, question_type="mcq_text_reverse", correct=False)
        assert card.strength == 1
        assert due_after(card) == timedelta(minutes=10)
        assert card.review_stats.miss_streak == 1

    def test_flashcard_uses_the_self_rating(self) -> None:
        easy = review(
            StubDb(card_doc(strength=1, stage="flashcard")),
            question_type="flashcard_text",
            correct=True,
            rating="easy",
        )
        assert easy.strength == 3
        assert due_after(easy) == timedelta(days=4)
        again = review(
            StubDb(card_doc(strength=1, stage="flashcard")),
            question_type="flashcard_text",
            correct=False,
            rating="again",
        )
        assert again.strength == 0

    def test_no_question_type_uses_the_rating(self) -> None:
        card = review(StubDb(card_doc(strength=1)), question_type=None, rating="good")
        assert card.strength == 2
        assert card.history[-1].detail == "good"

    def test_reaching_full_strength_masters_the_card(self) -> None:
        db = StubDb(card_doc(strength=3, stage="mcq"))
        card = review(db, question_type="mcq_text_reading", correct=True)
        assert card.strength == 4
        assert card.review_stats.mastered is True

    def test_strength_never_goes_below_zero(self) -> None:
        card = review(
            StubDb(card_doc(strength=0, stage="flashcard")),
            question_type="flashcard_text",
            correct=False,
            rating="again",
        )
        assert card.strength == 0


class TestFillIsGradedByTheServer:
    def test_right_typed_answer_counts_even_if_client_says_wrong(self) -> None:
        db = StubDb(card_doc(strength=4, stage="fill"))
        card = review(
            db, question_type="fill_text_reading", correct=False, answer="ショッケン"
        )
        # Fill correct is always "easy": first review due in 4 days.
        assert due_after(card) == timedelta(days=4)
        assert card.review_stats.stage_streak == 1

    def test_wrong_typed_answer_is_a_miss_even_if_client_says_right(self) -> None:
        db = StubDb(card_doc(strength=4, stage="fill"))
        card = review(
            db, question_type="fill_text_reading", correct=True, answer="しょけん"
        )
        assert card.strength == 3
        assert card.review_stats.miss_streak == 1

    def test_show_answer_empty_text_is_a_miss(self) -> None:
        db = StubDb(card_doc(strength=4, stage="fill"))
        card = review(db, question_type="fill_text_translate", correct=False, answer="")
        assert card.strength == 3


class TestStageProgression:
    def test_text_card_with_photo_promotes_to_photo_mcq(self) -> None:
        db = StubDb(card_doc(strength=1, stage="flashcard", stage_streak=1, photo=True))
        card = review(db, question_type="flashcard_text", correct=True, rating="good")
        assert card.review_stats.stage == "mcq_photo"
        assert card.review_stats.stage_streak == 0

    def test_text_card_without_photo_skips_photo_mcq(self) -> None:
        db = StubDb(card_doc(strength=1, stage="flashcard", stage_streak=1))
        card = review(db, question_type="flashcard_text", correct=True, rating="good")
        assert card.review_stats.stage == "mcq"

    def test_two_misses_demote(self) -> None:
        db = StubDb(card_doc(strength=4, stage="fill", miss_streak=1))
        card = review(db, question_type="fill_text_reading", answer="ちがう")
        assert card.review_stats.stage == "mcq"
        assert card.review_stats.miss_streak == 0

    def test_legacy_card_without_stage_starts_from_its_strength(self) -> None:
        db = StubDb(card_doc(strength=3, stage=None))
        card = review(db, question_type="mcq_text_reading", correct=True)
        assert card.review_stats.stage == "mcq"
        assert card.review_stats.stage_streak == 1


class TestStaleAnswers:
    def test_question_for_another_stage_changes_nothing(self) -> None:
        db = StubDb(card_doc(strength=2, stage="mcq", stage_streak=2))
        card = review(
            db,
            question_type="flashcard_text",
            correct=True,
            rating="easy",
            session_id=SESSION_ID,
        )
        assert db.writes_to("flashcards") == []
        assert card.strength == 2
        assert card.review_stats.stage == "mcq"
        assert card.review_stats.stage_streak == 2
        # Still listed in the session, with no strength change.
        (session_write,) = db.writes_to("review_sessions")
        (answer,) = session_write["answers"].values
        assert answer["strength_before"] == answer["strength_after"] == 2


class TestWrites:
    def test_card_update_fields(self) -> None:
        db = StubDb(card_doc(strength=2, stage="mcq"))
        review(db, question_type="mcq_text_reading", correct=True)
        write = only_card_write(db)
        assert set(write) == {"review_stats", "strength", "history"}
        assert write["strength"] == 3
        assert write["review_stats"]["stage"] == "mcq"
        assert isinstance(write["history"], ArrayUnion)
        (event,) = write["history"].values
        assert event["type"] == "reviewed"
        assert event["detail"] == "mcq_text_reading"
        assert event["strength_after"] == 3

    def test_session_answer_is_recorded_with_a_card_snapshot(self) -> None:
        db = StubDb(card_doc(strength=2, stage="mcq"))
        review(
            db, question_type="mcq_text_reading", correct=False, session_id=SESSION_ID
        )
        (session_write,) = db.writes_to("review_sessions")
        (answer,) = session_write["answers"].values
        assert answer["flashcard_id"] == CARD_ID
        assert answer["correct"] is False
        assert (answer["strength_before"], answer["strength_after"]) == (2, 1)
        assert (answer["text"], answer["meaning"], answer["area"]) == (
            "食券",
            "meal ticket",
            "Koenji",
        )

    def test_no_session_id_writes_no_session_answer(self) -> None:
        db = StubDb(card_doc(strength=2, stage="mcq"))
        review(db, question_type="mcq_text_reading", correct=True)
        assert db.writes_to("review_sessions") == []

    def test_missing_card_is_404(self) -> None:
        db = StubDb(card_doc())
        db.docs.clear()
        with pytest.raises(HTTPException) as err:
            review(db, question_type="mcq_text_reading", correct=True)
        assert err.value.status_code == 404

    def test_firestore_failure_is_503(self) -> None:
        db = StubDb(card_doc(strength=2, stage="mcq"))
        db.fail_updates = True
        with pytest.raises(HTTPException) as err:
            review(db, question_type="mcq_text_reading", correct=True)
        assert err.value.status_code == 503
