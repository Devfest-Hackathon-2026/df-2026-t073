"""Home's summary reports whether the user has finished a rehearsal."""

import asyncio
from typing import Any

import pytest

from app.services import visits


class _Snap:
    def __init__(self, data: dict[str, Any]) -> None:
        self._data = data

    def to_dict(self) -> dict[str, Any]:
        return self._data


class _Doc:
    def __init__(self, data: dict[str, Any]) -> None:
        self._data = data

    async def get(self) -> _Snap:
        return _Snap(self._data)


class _Collection:
    def __init__(self, data: dict[str, Any]) -> None:
        self._data = data

    def document(self, _uid: str) -> _Doc:
        return _Doc(self._data)


class _Db:
    def __init__(self, user: dict[str, Any]) -> None:
        self._user = user

    def collection(self, _name: str) -> _Collection:
        return _Collection(self._user)


@pytest.fixture(autouse=True)
def _no_other_data(monkeypatch: pytest.MonkeyPatch) -> None:
    async def empty(*_args: Any, **_kwargs: Any) -> list[Any]:
        return []

    async def no_facts(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        return {}

    monkeypatch.setattr(visits, "list_flashcards", empty)
    monkeypatch.setattr(visits, "list_upcoming_visits", empty)
    monkeypatch.setattr(visits, "list_favorite_places", empty)
    monkeypatch.setattr(visits, "place_facts", no_facts)
    monkeypatch.setattr(visits, "_word_of_day", lambda *_a, **_k: None)


def _today(user: dict[str, Any]) -> visits.TodayResponse:
    return asyncio.run(visits.build_today(db=_Db(user), uid="u1"))  # type: ignore[arg-type]


def test_new_user_has_not_rehearsed() -> None:
    assert _today({}).rehearsed_once is False


def test_flag_on_the_user_is_returned() -> None:
    assert _today({"rehearsed_once": True}).rehearsed_once is True
