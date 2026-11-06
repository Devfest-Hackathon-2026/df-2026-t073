from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from google.cloud.firestore import AsyncClient

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.core.firebase import get_firestore_client
from app.schemas.user import UserProfile
from app.services.firestore import sync_user_profile

api_router = APIRouter()


@api_router.get("/healthz", tags=["health"])
async def health_check() -> dict[str, str]:
    """Liveness probe for Cloud Run."""
    return {"status": "ok"}


@api_router.get("/readyz", tags=["health"])
async def readiness_check() -> dict[str, str]:
    """Readiness probe verifying Firebase & Firestore client initialization."""
    try:
        get_firestore_client()
        return {"status": "ready"}
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@api_router.get(
    f"{settings.API_V1_STR}/me",
    response_model=UserProfile,
    tags=["auth"],
)
async def read_current_user(
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncClient = Depends(get_db),
) -> UserProfile:
    """Verify Firebase Auth Bearer token and sync the user's profile in Firestore."""
    return await sync_user_profile(db=db, decoded_claims=current_user)
