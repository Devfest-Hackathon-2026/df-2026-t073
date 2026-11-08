from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, Db
from app.schemas.lists import ListCreateRequest, ListUpdateRequest, TangoList
from app.services import lists

router = APIRouter(prefix="/lists", tags=["lists"])


@router.get("", response_model=list[TangoList])
async def get_lists(current_user: CurrentUser, db: Db) -> list[TangoList]:
    """The user's review lists, oldest first."""
    return await lists.list_lists(db=db, uid=current_user["uid"])


@router.post("", response_model=TangoList, status_code=status.HTTP_201_CREATED)
async def create_list(payload: ListCreateRequest, current_user: CurrentUser, db: Db) -> TangoList:
    return await lists.create_list(db=db, uid=current_user["uid"], request=payload)


@router.patch("/{list_id}", response_model=TangoList)
async def update_list(list_id: str, payload: ListUpdateRequest, current_user: CurrentUser, db: Db) -> TangoList:
    """Rename and/or add and remove Tango (by flashcard id)."""
    return await lists.update_list(db=db, uid=current_user["uid"], list_id=list_id, request=payload)


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_list(list_id: str, current_user: CurrentUser, db: Db) -> Response:
    await lists.delete_list(db=db, uid=current_user["uid"], list_id=list_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
