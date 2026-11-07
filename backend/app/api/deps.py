from typing import Annotated, Any

import anyio
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth
from google.cloud.firestore import AsyncClient

from app.core.firebase import get_firestore_client

bearer_scheme = HTTPBearer(auto_error=False)


def get_db() -> AsyncClient:
    """FastAPI dependency that provides the shared Async Firestore client."""
    try:
        return get_firestore_client()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> dict[str, Any]:
    """Verify the ID token locally (signature + expiry). No network call per request."""
    return await _verify(credentials, check_revoked=False)


async def get_current_user_strict(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> dict[str, Any]:
    """Also check revocation and disabled accounts via the Firebase Auth API.

    Costs one network call per request; use only on sensitive routes.
    """
    return await _verify(credentials, check_revoked=True)


async def _verify(
    credentials: HTTPAuthorizationCredentials | None, *, check_revoked: bool
) -> dict[str, Any]:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        # Run synchronous token verification in a worker thread to avoid blocking the event loop
        decoded_token: dict[str, Any] = await anyio.to_thread.run_sync(
            lambda: auth.verify_id_token(token, check_revoked=check_revoked)
        )
        return decoded_token
    # Revoked and Expired subclass InvalidIdTokenError, so they must come first.
    except auth.RevokedIdTokenError as exc:
        raise _unauthorized("Firebase ID token has been revoked.") from exc
    except auth.ExpiredIdTokenError as exc:
        raise _unauthorized("Firebase ID token has expired.") from exc
    except (auth.InvalidIdTokenError, ValueError) as exc:
        raise _unauthorized("Invalid Firebase ID token.") from exc
    except auth.UserDisabledError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled.",
        ) from exc
    except auth.CertificateFetchError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable.",
        ) from exc
    # Any other error is a server problem: let it surface as a 500.


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


# Use these as route parameter types, e.g. `async def route(user: CurrentUser, db: Db)`.
CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]
CurrentUserStrict = Annotated[dict[str, Any], Depends(get_current_user_strict)]
Db = Annotated[AsyncClient, Depends(get_db)]
