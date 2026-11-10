from datetime import UTC, datetime

from app.schemas.place import JpName, Place
from app.schemas.rehearsal import RehearsalSession, RehearsalTurn, TurnResult
from app.services import rehearsal_rules as rules
from tests.review_rules.factories import card

NOW = datetime(2026, 11, 9, tzinfo=UTC)
SHOKKEN = card("fc_shokken", kanji="食券", reading="しょっけん", strength=2)
KAEDAMA = card("fc_kaedama", kanji="替え玉", reading="かえだま")
OOMORI = card("fc_oomori", kanji="大盛り", reading="おおもり")


def turn(turn_id: str, speaker: str, text: str) -> RehearsalTurn:
    return RehearsalTurn(id=turn_id, speaker=speaker, jp=JpName(text=text), en="")  # type: ignore[arg-type]


TURNS = [
    turn("s1", "staff", "食券をお願いします"),
    turn("u1", "user", "はい"),
    turn("s2", "staff", "替え玉はいかがですか"),
    turn("u2", "user", "はい"),
    turn("s3", "staff", "大盛りもできますよ"),
]


def answer(turn_id: str, said: str, *, spoken: bool = True) -> TurnResult:
    return TurnResult(
        turn_id=turn_id, staff=JpName(text=""), said=JpName(text=said), spoken=spoken, ok=True, label="", note=""
    )


def session(answers: dict[str, TurnResult]) -> RehearsalSession:
    return RehearsalSession(
        rehearsal_id="rh1",
        place=Place(id="p", name=JpName(text="麺屋たいき"), lat=0, lng=0),
        language="English",
        turns=TURNS,
        started_at=NOW,
        answers=answers,
    )


def kinds(events: list) -> set[tuple[str, str]]:
    return {(fid, e.type) for fid, e in events}


def test_heard_from_staff_and_said_out_loud() -> None:
    s = session({"u1": answer("u1", "食券です"), "u2": answer("u2", "替え玉ください")})
    events = rules.rehearsal_history(s, [SHOKKEN, KAEDAMA, OOMORI])
    assert kinds(events) == {
        ("fc_shokken", "heard_in_rehearsal"),
        ("fc_shokken", "said_in_rehearsal"),
        ("fc_kaedama", "heard_in_rehearsal"),
        ("fc_kaedama", "said_in_rehearsal"),
        # Finished, so the closing staff line counts too.
        ("fc_oomori", "heard_in_rehearsal"),
    }
    first = events[0][1]
    assert first.detail == "麺屋たいき"
    assert first.rehearsal_id == "rh1"
    assert first.strength_after == 2  # practice doesn't change strength


def test_unfinished_only_counts_lines_reached() -> None:
    s = session({"u1": answer("u1", "はい")})
    events = rules.rehearsal_history(s, [SHOKKEN, KAEDAMA, OOMORI])
    assert kinds(events) == {("fc_shokken", "heard_in_rehearsal")}


def test_picked_reply_is_not_said() -> None:
    s = session({"u1": answer("u1", "食券です", spoken=False)})
    events = rules.rehearsal_history(s, [SHOKKEN])
    assert kinds(events) == {("fc_shokken", "heard_in_rehearsal")}


def test_nothing_before_any_answer() -> None:
    assert rules.rehearsal_history(session({}), [SHOKKEN]) == []


def test_recorded_once_per_rehearsal() -> None:
    s = session({"u1": answer("u1", "食券です")})
    first = rules.rehearsal_history(s, [SHOKKEN])
    updated = SHOKKEN.model_copy(update={"history": [*SHOKKEN.history, *(e for _, e in first)]})
    assert rules.rehearsal_history(s, [updated]) == []
    # A new rehearsal records again.
    again = rules.rehearsal_history(s.model_copy(update={"rehearsal_id": "rh2"}), [updated])
    assert len(again) == 2


def test_overlapping_writes_produce_identical_events() -> None:
    # Two results loads at once both see nothing recorded; identical events let
    # Firestore's ArrayUnion keep just one.
    s = session({"u1": answer("u1", "食券です")})
    first = [e.model_dump() for _, e in rules.rehearsal_history(s, [SHOKKEN])]
    second = [e.model_dump() for _, e in rules.rehearsal_history(s, [SHOKKEN])]
    assert first == second
    assert all(e["at"] == NOW for e in first)
