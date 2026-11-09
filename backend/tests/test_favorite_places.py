import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_db, get_http
from app.core.config import settings
from app.schemas.place import JpName, Place
from app.services import favorite_places
from main import app

UID = "u1"


def place(place_id: str, name: str = "麺屋たいき") -> Place:
    return Place(id=place_id, name=JpName(text=name), lat=35.7, lng=139.65)


class _Doc:
    def __init__(self, data: dict[str, Any]) -> None:
        self._data = data
        self.exists = bool(data)

    def to_dict(self) -> dict[str, Any]:
        return self._data


class FakeDb:
    """Just enough of Firestore for users/{uid}/favorite_places."""

    def __init__(self) -> None:
        self.docs: dict[str, dict[str, Any]] = {}
        self.usage_docs: dict[str, int] = {}
        self._path: list[str] = []

    def collection(self, name: str) -> "FakeDb":
        self._path.append(name)
        return self

    def document(self, name: str) -> "FakeDb":
        self._path.append(name)
        return self

    def order_by(self, *_: Any, **__: Any) -> "FakeDb":
        return self

    def limit(self, _: int) -> "FakeDb":
        return self

    async def get(self) -> _Doc:
        if "usage" in self._path:
            data = dict(self.usage_docs)
        else:
            doc_id = self._path[-1] if self._path else ""
            data = self.docs.get(doc_id, {})
        self._path = []
        return _Doc(data)

    async def set(
        self,
        data: dict[str, Any],
        *args: Any,
        merge: bool = False,
        **kwargs: Any,
    ) -> None:
        doc_id = self._path[-1]
        if "usage" in self._path:
            for k in data:
                self.usage_docs[k] = self.usage_docs.get(k, 0) + 1
        else:
            if merge and doc_id in self.docs:
                self.docs[doc_id].update(data)
            else:
                self.docs[doc_id] = data
        self._path = []

    async def delete(self) -> None:
        self.docs.pop(self._path[-1], None)
        self._path = []

    async def stream(self) -> Any:
        self._path = []
        for data in sorted(
            self.docs.values(), key=lambda d: d["added_at"], reverse=True
        ):
            yield _Doc(data)


@pytest.fixture
def db(monkeypatch: pytest.MonkeyPatch) -> FakeDb:
    async def get_place(*, place_id: str, **_: Any) -> Place:
        return place(place_id)

    monkeypatch.setattr(favorite_places, "get_place", get_place)
    return FakeDb()


def fake(stub: object) -> Any:
    """Typed as Any: the stubs stand in for AsyncClient and httpx.AsyncClient."""
    return stub


def run(coro: Any) -> Any:
    return asyncio.run(coro)


class _TickingClock:
    """Each call is a second later, so saves in one test never tie."""

    def __init__(self) -> None:
        self._now = datetime(2026, 1, 1, tzinfo=UTC)

    def now(self, tz: Any = None) -> datetime:
        self._now += timedelta(seconds=1)
        return self._now


class TestService:
    def test_add_list_remove(
        self, db: FakeDb, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Two saves in the same instant would tie on added_at.
        monkeypatch.setattr(favorite_places, "datetime", _TickingClock())
        run(
            favorite_places.add_favorite_place(
                db=fake(db), http=fake(None), uid=UID, place_id="a"
            )
        )
        run(
            favorite_places.add_favorite_place(
                db=fake(db), http=fake(None), uid=UID, place_id="b"
            )
        )
        listed = run(favorite_places.list_favorite_places(db=fake(db), uid=UID))
        assert [p.id for p in listed] == ["b", "a"]  # newest first
        run(favorite_places.remove_favorite_place(db=fake(db), uid=UID, place_id="a"))
        listed = run(favorite_places.list_favorite_places(db=fake(db), uid=UID))
        assert [p.id for p in listed] == ["b"]

    def test_adding_twice_keeps_one(self, db: FakeDb) -> None:
        for _ in range(2):
            run(
                favorite_places.add_favorite_place(
                    db=fake(db), http=fake(None), uid=UID, place_id="a"
                )
            )
        assert list(db.docs) == ["a"]

    def test_removing_a_non_favorite_is_fine(self, db: FakeDb) -> None:
        run(
            favorite_places.remove_favorite_place(db=fake(db), uid=UID, place_id="nope")
        )
        assert db.docs == {}


def test_each_favorite_is_a_pin_that_opens_its_place() -> None:
    pins = favorite_places.favorite_pins([place("menya-taiki")])
    assert len(pins) == 1
    pin = pins[0]
    assert (pin.kind, pin.place_id, pin.label) == (
        "favorite",
        "menya-taiki",
        "麺屋たいき",
    )
    assert (pin.lat, pin.lng) == (35.7, 139.65)


class TestRoutes:
    URL = f"{settings.API_V1_STR}/me/favorite-places"

    @pytest.fixture
    def client(self, db: FakeDb) -> Any:
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_http] = lambda: None
        app.dependency_overrides[get_current_user] = lambda: {"uid": UID}
        yield TestClient(app)
        app.dependency_overrides.clear()

    def test_put_get_delete(self, client: TestClient) -> None:
        assert client.put(f"{self.URL}/menya-taiki").json()["id"] == "menya-taiki"
        assert [p["id"] for p in client.get(self.URL).json()] == ["menya-taiki"]
        assert client.delete(f"{self.URL}/menya-taiki").status_code == 204
        assert client.get(self.URL).json() == []
