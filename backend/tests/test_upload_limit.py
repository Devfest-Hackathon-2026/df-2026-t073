from fastapi import FastAPI
from starlette.testclient import TestClient

from app.core.upload_limit import ContentSizeLimitMiddleware


def create_test_app(max_bytes: int = 30) -> FastAPI:
    app = FastAPI()
    app.add_middleware(ContentSizeLimitMiddleware, max_bytes=max_bytes)

    @app.post("/test-upload")
    async def upload_endpoint(payload: dict) -> dict:
        return payload

    return app


def test_upload_within_limit() -> None:
    app = create_test_app(max_bytes=1000)
    client = TestClient(app)
    resp = client.post("/test-upload", json={"key": "small payload"})
    assert resp.status_code == 200


def test_upload_exceeding_content_length_limit() -> None:
    app = create_test_app(max_bytes=30)
    client = TestClient(app)
    large_payload = {"key": "x" * 20000}
    resp = client.post("/test-upload", json=large_payload)
    assert resp.status_code == 413
    assert "exceeds maximum size" in resp.json()["detail"]
