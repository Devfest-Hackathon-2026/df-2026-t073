from fastapi import APIRouter

from app.api.deps import CurrentUser, Db
from app.schemas.user import ProfileResponse, ProfileUpdateRequest
from app.services import profile

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/profile", response_model=ProfileResponse)
async def get_my_profile(current_user: CurrentUser, db: Db) -> ProfileResponse:
    """Me tab: name, reading level, home area, and counts (Tango, stars, places)."""
    return await profile.get_profile(db=db, uid=current_user["uid"])


@router.put("/profile", response_model=ProfileResponse)
async def update_my_profile(
    payload: ProfileUpdateRequest,
    current_user: CurrentUser,
    db: Db,
) -> ProfileResponse:
    """Change name, reading level or home area. Fields left out stay as they are."""
    return await profile.update_profile(db=db, uid=current_user["uid"], update=payload)
