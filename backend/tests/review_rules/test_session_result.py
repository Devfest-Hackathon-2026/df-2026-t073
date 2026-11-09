import asyncio
from typing import Any

import pytest

from app.schemas.place import JpName, Place, Visit
from app.schemas.review import ReviewSessionRecord
from app.services import review
from tests.review_rules.factories import NOW

PLACE = Place(
    id="nakano-ward-office",
    name=JpName(text="中野区役所", meaning="Nakano Ward Office"),
    lat=35.7,
    lng=139.66,
)


def result(monkeypatch: pytest.MonkeyPatch, upcoming: list[Visit]) -> Any:
    async def get_review_session(**_: Any) -> ReviewSessionRecord:
        return ReviewSessionRecord(session_id="rs", flashcard_ids=[], started_at=NOW)

    async def list_upcoming_visits(**_: Any) -> list[Visit]:
        return upcoming

    monkeypatch.setattr(review, "get_review_session", get_review_session)
    monkeypatch.setattr(review, "list_upcoming_visits", list_upcoming_visits)
    return asyncio.run(
        review.get_session_result(db=None, uid="u1", session_id="rs")  # type: ignore[arg-type]  # lookups are stubbed
    )


def test_next_is_the_first_upcoming_visit(monkeypatch: pytest.MonkeyPatch) -> None:
    first = Visit(visit_id="v1", place=PLACE, when=NOW, tango_count=2)
    later = Visit(visit_id="v2", place=PLACE, when=NOW, tango_count=0)
    assert result(monkeypatch, [first, later]).next == first


def test_no_plans_means_no_next(monkeypatch: pytest.MonkeyPatch) -> None:
    assert result(monkeypatch, []).next is None
