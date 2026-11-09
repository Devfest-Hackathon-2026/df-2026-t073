from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.core.etag import ETagMiddleware


def test_etag_header_generation() -> None:
    app = FastAPI()
    app.add_middleware(ETagMiddleware)

    @app.get("/test")
    def get_test():
        return {"hello": "world"}

    client = TestClient(app)
    resp = client.get("/test")
    assert resp.status_code == 200
    assert "etag" in resp.headers
    etag = resp.headers["etag"]
    assert etag.startswith('"') and etag.endswith('"')
    assert resp.json() == {"hello": "world"}


def test_etag_304_not_modified() -> None:
    app = FastAPI()
    app.add_middleware(ETagMiddleware)

    @app.get("/test")
    def get_test():
        return {"data": [1, 2, 3]}

    client = TestClient(app)
    resp1 = client.get("/test")
    etag = resp1.headers["etag"]

    # 1. Matching exact ETag
    resp2 = client.get("/test", headers={"If-None-Match": etag})
    assert resp2.status_code == 304
    assert resp2.text == ""
    assert resp2.headers.get("etag") == etag

    # 2. Matching weak ETag W/
    resp3 = client.get("/test", headers={"If-None-Match": f"W/{etag}"})
    assert resp3.status_code == 304
    assert resp3.text == ""

    # 3. Non-matching ETag
    resp4 = client.get("/test", headers={"If-None-Match": '"different-hash"'})
    assert resp4.status_code == 200
    assert resp4.json() == {"data": [1, 2, 3]}


def test_etag_ignored_for_non_get() -> None:
    app = FastAPI()
    app.add_middleware(ETagMiddleware)

    @app.post("/test")
    def post_test(payload: dict):
        return {"received": payload}

    client = TestClient(app)
    resp = client.post("/test", json={"a": 1})
    assert resp.status_code == 200
    assert "etag" not in resp.headers

