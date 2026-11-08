import asyncio
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from google.api_core.exceptions import ServiceUnavailable

from app.services import usage


class FakeRef:
    def __init__(self, store: dict, fail: bool = False):
        self.store = store
        self.fail = fail

    def collection(self, _name):
        return self

    def document(self, _name):
        return self

    async def set(self, data, merge=False):
        if self.fail:
            raise ServiceUnavailable("down")
        for key in data:
            self.store[key] = self.store.get(key, 0) + 1

    async def get(self):
        store = self.store

        class Snap:
            def to_dict(self):
                return dict(store)

        return Snap()


def run(coro):
    return asyncio.run(coro)


def test_day_changes_at_midnight_in_japan():
    # 15:30 UTC is 00:30 the next day in Japan.
    assert usage.usage_key(datetime(2026, 11, 8, 15, 30, tzinfo=timezone.utc)) == "2026-11-09"
    assert usage.usage_key(datetime(2026, 11, 8, 14, 30, tzinfo=timezone.utc)) == "2026-11-08"


def test_over_only_past_the_limit():
    assert not usage.is_over(3, 3)
    assert usage.is_over(4, 3)
    assert not usage.is_over(999, 0)  # 0 = unlimited


def test_limit_reached_gives_a_friendly_429(monkeypatch):
    monkeypatch.setattr(usage.settings, "LIMIT_TTS", 2)
    db = FakeRef({})
    run(usage.charge(db=db, uid="u1", kind="tts"))
    run(usage.charge(db=db, uid="u1", kind="tts"))
    with pytest.raises(HTTPException) as err:
        run(usage.charge(db=db, uid="u1", kind="tts"))
    assert err.value.status_code == 429
    assert "audio" in err.value.detail


def test_counter_down_lets_the_call_through(monkeypatch):
    monkeypatch.setattr(usage.settings, "LIMIT_TTS", 1)
    run(usage.charge(db=FakeRef({}, fail=True), uid="u1", kind="tts"))
