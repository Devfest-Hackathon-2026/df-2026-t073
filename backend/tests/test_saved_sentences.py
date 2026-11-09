import asyncio
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi import HTTPException

from app.schemas.flashcard import SavedSentence
from app.schemas.place import JpName, Place
from app.schemas.rehearsal import RehearsalSession, Suggestion, TurnResult
from app.services import firestore, rehearsal
from app.services import rehearsal_rules as rules
from tests.review_rules.factories import card
from tests.review_rules.test_answers_characterization import (
    CARD_ID,
    UID,
    StubDb,
    card_doc,
)

NOW = datetime(2026, 11, 9, tzinfo=UTC)
SHOKKEN = card("fc_shokken", kanji="食券", reading="しょっけん")
KAEDAMA = card("fc_kaedama", kanji="替え玉", reading="かえだま")


def result(said: str, suggestion: str | None = None) -> TurnResult:
    return TurnResult(
        turn_id="t1",
        staff=JpName(text="いらっしゃいませ"),
        said=JpName(text=said),
        spoken=True,
        ok=suggestion is None,
        label="",
        note="",
        suggestion=Suggestion(jp=JpName(text=suggestion, reading="よみ"), why="")
        if suggestion
        else None,
    )


def save(r: TurnResult, *, use_suggestion: bool = False) -> SavedSentence | None:
    return rules.sentence_to_save(
        r,
        use_suggestion=use_suggestion,
        rehearsal_id="rh1",
        place_name="麺屋たいき",
        sentence_id="sn1",
        now=NOW,
    )


class TestRules:
    def test_a_sentence_matches_the_tango_whose_word_it_contains(self) -> None:
        found = rules.tango_in("食券をください", [SHOKKEN, KAEDAMA])
        assert [t.flashcard_id for t in found] == ["fc_shokken"]
        assert found[0].text == "食券"
        assert rules.tango_in("こんにちは", [SHOKKEN]) == []

    def test_result_lines_list_matches_for_each_version(self) -> None:
        line = rules.result_line(
            result("しょっけん", "食券と替え玉をください"), [SHOKKEN, KAEDAMA]
        )
        assert line.said_tango == []
        assert {t.flashcard_id for t in line.suggestion_tango} == {
            "fc_shokken",
            "fc_kaedama",
        }
        assert line.turn_id == "t1"

    def test_save_what_was_said_or_the_suggestion(self) -> None:
        yours = save(result("食券", "食券をください"))
        suggested = save(result("食券", "食券をください"), use_suggestion=True)
        assert yours is not None and (yours.text, yours.kind) == ("食券", "yours")
        assert suggested is not None and (suggested.text, suggested.kind) == (
            "食券をください",
            "suggested",
        )
        assert suggested.reading == "よみ" and suggested.place_name == "麺屋たいき"

    def test_no_suggestion_means_nothing_to_save(self) -> None:
        assert save(result("食券"), use_suggestion=True) is None

    def test_the_same_line_and_version_is_saved_once(self) -> None:
        sentence = save(result("食券"))
        assert sentence is not None
        saved = SHOKKEN.model_copy(update={"saved_sentences": [sentence]})
        assert rules.already_saved(saved, sentence) is True
        other_version = sentence.model_copy(update={"kind": "suggested"})
        assert rules.already_saved(saved, other_version) is False


class TestSaveService:
    @pytest.fixture
    def saved(self, monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, SavedSentence]]:
        calls: list[tuple[str, SavedSentence]] = []
        session = RehearsalSession(
            rehearsal_id="rh1",
            place=Place(id="p", name=JpName(text="麺屋たいき"), lat=0, lng=0),
            language="English",
            turns=[],
            started_at=NOW,
            answers={"t1": result("食券をください", "食券と替え玉をください")},
        )
        already = save(result("食券をください"))
        assert already is not None
        cards = [SHOKKEN.model_copy(update={"saved_sentences": [already]}), KAEDAMA]

        async def _session(*_: Any) -> RehearsalSession:
            return session

        async def list_flashcards(**_: Any) -> list[Any]:
            return cards

        async def add_saved_sentence(
            *, flashcard_id: str, sentence: SavedSentence, **_: Any
        ) -> None:
            calls.append((flashcard_id, sentence))

        monkeypatch.setattr(rehearsal, "_session", _session)
        monkeypatch.setattr(rehearsal, "list_flashcards", list_flashcards)
        monkeypatch.setattr(rehearsal, "add_saved_sentence", add_saved_sentence)
        return calls

    def run(self, **kw: Any) -> Any:
        return asyncio.run(
            rehearsal.save_sentence(db=fake(None), uid=UID, rehearsal_id="rh1", **kw)
        )

    def test_saves_the_suggestion_to_each_matching_tango(
        self, saved: list[Any]
    ) -> None:
        response = self.run(turn_id="t1", use_suggestion=True)
        assert {t.flashcard_id for t in response.saved_to} == {
            "fc_shokken",
            "fc_kaedama",
        }
        assert {fid for fid, _ in saved} == {"fc_shokken", "fc_kaedama"}
        assert all(s.kind == "suggested" for _, s in saved)

    def test_does_not_save_a_line_twice(self, saved: list[Any]) -> None:
        response = self.run(turn_id="t1", use_suggestion=False)
        # 食券 already has this line; it's reported as saved but not written again.
        assert [t.flashcard_id for t in response.saved_to] == ["fc_shokken"]
        assert saved == []

    def test_unknown_turn_is_404(self, saved: list[Any]) -> None:
        with pytest.raises(HTTPException) as err:
            self.run(turn_id="nope", use_suggestion=False)
        assert err.value.status_code == 404


def fake(stub: object) -> Any:
    """Typed as Any: stands in for AsyncClient."""
    return stub


def test_removing_a_saved_sentence() -> None:
    doc = card_doc()
    keep = save(result("食券"))
    drop = save(result("食券"), use_suggestion=False)
    assert keep is not None and drop is not None
    drop = drop.model_copy(update={"sentence_id": "sn_drop"})
    doc["saved_sentences"] = [
        keep.model_dump(mode="python"),
        drop.model_dump(mode="python"),
    ]
    db = StubDb(doc)
    updated = asyncio.run(
        firestore.remove_saved_sentence(
            db=fake(db), uid=UID, flashcard_id=CARD_ID, sentence_id="sn_drop"
        )
    )
    assert [s.sentence_id for s in updated.saved_sentences] == ["sn1"]
    (write,) = db.writes_to("flashcards")
    assert [s["sentence_id"] for s in write["saved_sentences"]] == ["sn1"]
