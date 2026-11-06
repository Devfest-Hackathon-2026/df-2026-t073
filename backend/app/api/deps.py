from typing import Any

import anyio
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth
from google.cloud.firestore import AsyncClient

from app.core.firebase import get_firestore_client

bearer_scheme = HTTPBearer(auto_error=False)


def get_db() -> AsyncClient:
    """FastAPI dependency that provides the shared Async Firestore client."""
    return get_firestore_client()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    """Verify the Firebase Auth Bearer ID token and return decoded user claims."""
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
            lambda: auth.verify_id_token(token, check_revoked=True)
        )
        return decoded_token
    except auth.RevokedIdTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase ID token has been revoked.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except auth.ExpiredIdTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase ID token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Firebase ID token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
