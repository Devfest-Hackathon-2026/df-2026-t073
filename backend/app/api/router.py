import asyncio
import time

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, Db
from app.api.endpoints import captures, dictionary, flashcards, lists, me, places, prepare, review
from app.core.config import settings
from app.schemas.user import UserProfile
from app.services.firestore import sync_user_profile

api_router = APIRouter()

# A successful Firestore check is reused for this long, so frequent probes
# don't cost a Firestore read each time.
_READY_CACHE_SECONDS = 60.0
_READY_TIMEOUT_SECONDS = 3.0
_last_ready_at: float | None = None


@api_router.get("/health", tags=["health"])
@api_router.get("/healthz", tags=["health"])
async def health_check() -> dict[str, str]:
    """Liveness probe for Cloud Run."""
    return {"status": "ok"}


@api_router.get("/readyz", tags=["health"])
async def readiness_check(db: Db) -> dict[str, str]:
    """Readiness probe: confirms Firestore is reachable with the current credentials."""
    global _last_ready_at
    now = time.monotonic()
    if _last_ready_at is not None and now - _last_ready_at < _READY_CACHE_SECONDS:
        return {"status": "ready"}

    try:
        # A missing doc is fine: the read still proves auth and connectivity.
        await asyncio.wait_for(
            db.collection("_health").document("ping").get(),
            timeout=_READY_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        _last_ready_at = None
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Firestore unreachable: {type(exc).__name__}",
        ) from exc

    _last_ready_at = now
    return {"status": "ready"}


@api_router.get(
    f"{settings.API_V1_STR}/me",
    response_model=UserProfile,
    tags=["auth"],
)
async def read_current_user(
    current_user: CurrentUser,
    db: Db,
) -> UserProfile:
    """Return the caller's profile from their token, syncing it to Firestore if changed."""
    return await sync_user_profile(db=db, decoded_claims=current_user)


api_router.include_router(captures.router, prefix=settings.API_V1_STR)
api_router.include_router(flashcards.router, prefix=settings.API_V1_STR)
api_router.include_router(review.router, prefix=settings.API_V1_STR)
api_router.include_router(me.router, prefix=settings.API_V1_STR)
api_router.include_router(places.router, prefix=settings.API_V1_STR)
api_router.include_router(prepare.router, prefix=settings.API_V1_STR)
api_router.include_router(dictionary.router, prefix=settings.API_V1_STR)
api_router.include_router(lists.router, prefix=settings.API_V1_STR)
