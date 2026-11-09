from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, Db, HttpClient
from app.schemas.place import Place
from app.schemas.user import ProfileResponse, ProfileUpdateRequest
from app.services import favorite_places, profile

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


@router.get("/favorite-places", response_model=list[Place])
async def list_my_favorite_places(current_user: CurrentUser, db: Db) -> list[Place]:
    """Favourite places, newest first (also shown as pins on the Map)."""
    return await favorite_places.list_favorite_places(db=db, uid=current_user["uid"])


@router.put("/favorite-places/{place_id}", response_model=Place)
async def add_my_favorite_place(
    place_id: str, current_user: CurrentUser, db: Db, http_client: HttpClient
) -> Place:
    """Favourite a place. Doing it twice is fine."""
    return await favorite_places.add_favorite_place(
        db=db, http=http_client, uid=current_user["uid"], place_id=place_id
    )


@router.delete("/favorite-places/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_my_favorite_place(place_id: str, current_user: CurrentUser, db: Db) -> Response:
    """Un-favourite a place. Doing it for a place that isn't a favourite is fine."""
    await favorite_places.remove_favorite_place(db=db, uid=current_user["uid"], place_id=place_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
