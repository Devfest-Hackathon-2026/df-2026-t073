"""Streaming request body size limit middleware."""

from starlette import status
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings


class _UploadLimitExceeded(Exception):
    """Internal exception raised when streaming request body exceeds configured limit."""


class ContentSizeLimitMiddleware:
    """Enforces a strict upper bound on request bodies across all endpoints.

    Protects memory against chunked transfer-encoding attacks where Content-Length is omitted.
    """

    def __init__(self, app: ASGIApp, max_bytes: int = settings.MAX_UPLOAD_BYTES):
        self.app = app
        self.max_bytes = max_bytes
        # Allow overhead margin for base64 encoding (4/3 ratio) and JSON metadata
        self.max_allowed = (max_bytes * 4) // 3 + 16384

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        content_length_raw = headers.get(b"content-length")
        if content_length_raw and content_length_raw.isdigit():
            if int(content_length_raw) > self.max_allowed:
                response = JSONResponse(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    content={
                        "detail": f"Request exceeds maximum size of {self.max_bytes // (1024 * 1024)} MiB."
                    },
                )
                await response(scope, receive, send)
                return

        total_bytes = 0

        async def limited_receive() -> Message:
            nonlocal total_bytes
            message = await receive()
            if message["type"] == "http.request":
                chunk = message.get("body", b"")
                total_bytes += len(chunk)
                if total_bytes > self.max_allowed:
                    raise _UploadLimitExceeded()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _UploadLimitExceeded:
            response = JSONResponse(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                content={
                    "detail": f"Request exceeds maximum size of {self.max_bytes // (1024 * 1024)} MiB."
                },
            )
            await response(scope, receive, send)

