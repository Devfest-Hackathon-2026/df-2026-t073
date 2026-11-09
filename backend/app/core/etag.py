"""HTTP ETag and 304 Not Modified middleware for GET requests."""

import hashlib
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class ETagMiddleware(BaseHTTPMiddleware):
    """Computes a SHA-256 ETag for JSON/text GET responses and handles 304 Not Modified."""

    async def dispatch(self, request: Request, call_next):
        if request.method != "GET":
            return await call_next(request)

        response = await call_next(request)
        if response.status_code != 200:
            return response

        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type and "text/" not in content_type:
            return response

        # Read response body
        body = b"".join([chunk async for chunk in response.body_iterator])
        etag = f'"{hashlib.sha256(body).hexdigest()[:16]}"'

        if_none_match = request.headers.get("if-none-match")
        if if_none_match:
            client_etag = if_none_match.strip()
            if (
                client_etag == etag
                or client_etag == f"W/{etag}"
                or client_etag.strip('"') == etag.strip('"')
            ):
                return Response(
                    status_code=304,
                    headers={
                        "ETag": etag,
                        "Cache-Control": "private, no-cache",
                    },
                )

        headers = dict(response.headers)
        headers["ETag"] = etag
        headers["Cache-Control"] = "private, no-cache"
        headers.pop("content-length", None)

        return Response(
            content=body,
            status_code=200,
            headers=headers,
            media_type=response.media_type,
        )

