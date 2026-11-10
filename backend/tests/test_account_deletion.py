import asyncio
from typing import Any

import pytest
from fastapi import HTTPException
from google.api_core.exceptions import ServiceUnavailable

from app.services import account_deletion


class FakeDoc:
    def __init__(self, store: dict[str, set[str]], path: str, doc_id: str, fail: set[str]) -> None:
        self.store, self.path, self.id, self.fail = store, path, doc_id, fail
        self.reference = self

    async def delete(self) -> None:
        if self.path in self.fail:
            raise ServiceUnavailable("down")
        self.store[self.path].discard(self.id)


class FakeCollection:
    def __init__(self, store: dict[str, set[str]], path: str, fail: set[str]) -> None:
        self.store, self.path, self.fail = store, path, fail

    def document(self, doc_id: str) -> "FakeUserDoc":
        return FakeUserDoc(self.store, f"{self.path}/{doc_id}", self.fail)

    async def stream(self) -> Any:
        for doc_id in list(self.store.get(self.path, set())):
            yield FakeDoc(self.store, self.path, doc_id, self.fail)


class FakeUserDoc:
    def __init__(self, store: dict[str, set[str]], path: str, fail: set[str]) -> None:
        self.store, self.path, self.fail = store, path, fail

    def collection(self, name: str) -> FakeCollection:
        return FakeCollection(self.store, f"{self.path}/{name}", self.fail)

    async def delete(self) -> None:
        self.store.pop(self.path, None)


class FakeDb:
    def __init__(self, store: dict[str, set[str]], fail: set[str] | None = None) -> None:
        self.store, self.fail = store, fail or set()

    def collection(self, name: str) -> FakeCollection:
        return FakeCollection(self.store, name, self.fail)


@pytest.fixture
def auth_deleted(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    deleted: list[str] = []
    monkeypatch.setattr(account_deletion, "_purge_photos_sync", lambda uid: True)
    monkeypatch.setattr(account_deletion, "_delete_auth_sync", deleted.append)
    return deleted


def user_data() -> dict[str, set[str]]:
    return {
        "users/u1": {"doc"},
        "users/u1/flashcards": {"fc1", "fc2"},
        "users/u1/visits": {"v1"},
        "users/u2/flashcards": {"other"},
    }


def test_deletes_all_user_data_then_the_sign_in(auth_deleted: list[str]) -> None:
    store = user_data()
    asyncio.run(account_deletion.delete_user_account(db=FakeDb(store), uid="u1"))  # type: ignore[arg-type]
    assert store["users/u1/flashcards"] == set()
    assert store["users/u1/visits"] == set()
    assert "users/u1" not in store
    assert store["users/u2/flashcards"] == {"other"}  # other users untouched
    assert auth_deleted == ["u1"]


def test_failed_step_reports_an_error_and_keeps_the_sign_in(auth_deleted: list[str]) -> None:
    store = user_data()
    db = FakeDb(store, fail={"users/u1/flashcards"})
    with pytest.raises(HTTPException) as exc:
        asyncio.run(account_deletion.delete_user_account(db=db, uid="u1"))  # type: ignore[arg-type]
    assert exc.value.status_code == 503
    # The other steps still ran, so a retry has less to do.
    assert store["users/u1/visits"] == set()
    assert auth_deleted == []


def test_failed_photo_delete_reports_an_error(
    auth_deleted: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(account_deletion, "_purge_photos_sync", lambda uid: False)
    with pytest.raises(HTTPException):
        asyncio.run(account_deletion.delete_user_account(db=FakeDb(user_data()), uid="u1"))  # type: ignore[arg-type]
    assert auth_deleted == []
