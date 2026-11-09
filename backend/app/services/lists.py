"""User-made review lists (users/{uid}/lists) and the favorite flag on cards."""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError
from google.cloud.firestore import AsyncClient

from app.schemas.flashcard import FlashcardResponse
from app.schemas.lists import ListCreateRequest, ListUpdateRequest, TangoList
from app.services.firestore import USERS_COLLECTION, get_flashcard

logger = logging.getLogger(__name__)

LISTS_SUBCOLLECTION = "lists"
FLASHCARDS_SUBCOLLECTION = "flashcards"


def apply_ids(current: list[str], add: list[str], remove: list[str]) -> list[str]:
    """New ids are appended once, in order; removed ids are dropped."""
    gone = set(remove)
    result = [i for i in current if i not in gone]
    for i in add:
        if i not in gone and i not in result:
            result.append(i)
    return result


def _lists(db: AsyncClient, uid: str) -> Any:
    return db.collection(USERS_COLLECTION).document(uid).collection(LISTS_SUBCOLLECTION)


def _unavailable(exc: Exception) -> HTTPException:
    logger.exception("Lists storage failed")
    return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Could not reach saved lists.")


async def list_lists(*, db: AsyncClient, uid: str) -> list[TangoList]:
    try:
        docs = [snap async for snap in _lists(db, uid).stream()]
    except (GoogleAPICallError, GoogleAuthError) as exc:
        raise _unavailable(exc) from exc
    lists = [TangoList.model_validate(d.to_dict()) for d in docs if d.to_dict()]
    lists.sort(key=lambda t: t.created_at)
    return lists


async def get_list(*, db: AsyncClient, uid: str, list_id: str) -> TangoList:
    try:
        snap = await _lists(db, uid).document(list_id).get()
    except (GoogleAPICallError, GoogleAuthError) as exc:
        raise _unavailable(exc) from exc
    if not snap.exists:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"List '{list_id}' not found.")
    return TangoList.model_validate(snap.to_dict())


async def create_list(*, db: AsyncClient, uid: str, request: ListCreateRequest) -> TangoList:
    name = request.name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="List name cannot be empty.")
    existing = await list_lists(db=db, uid=uid)
    if any(l.name.lower() == name.lower() for l in existing):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"A list named '{name}' already exists.",
        )
    created = TangoList(
        list_id=f"ls_{uuid.uuid4().hex[:12]}",
        name=name,
        tango_ids=apply_ids([], request.tango_ids, []),
        created_at=datetime.now(timezone.utc),
    )
    try:
        await _lists(db, uid).document(created.list_id).set(created.model_dump(mode="python"))
    except (GoogleAPICallError, GoogleAuthError) as exc:
        raise _unavailable(exc) from exc
    return created


async def update_list(*, db: AsyncClient, uid: str, list_id: str, request: ListUpdateRequest) -> TangoList:
    current = await get_list(db=db, uid=uid, list_id=list_id)
    new_name = request.name.strip() if request.name else current.name
    if not new_name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="List name cannot be empty.")
    if new_name.lower() != current.name.lower():
        existing = await list_lists(db=db, uid=uid)
        if any(l.name.lower() == new_name.lower() and l.list_id != list_id for l in existing):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail=f"A list named '{new_name}' already exists.",
            )
    updated = current.model_copy(
        update={
            "name": new_name,
            "tango_ids": apply_ids(current.tango_ids, request.add, request.remove),
        }
    )
    try:
        await _lists(db, uid).document(list_id).set(updated.model_dump(mode="python"))
    except (GoogleAPICallError, GoogleAuthError) as exc:
        raise _unavailable(exc) from exc
    return updated


async def delete_list(*, db: AsyncClient, uid: str, list_id: str) -> None:
    try:
        await _lists(db, uid).document(list_id).delete()
    except (GoogleAPICallError, GoogleAuthError) as exc:
        raise _unavailable(exc) from exc


async def set_favorite(*, db: AsyncClient, uid: str, flashcard_id: str, favorite: bool) -> FlashcardResponse:
    card = await get_flashcard(db=db, uid=uid, flashcard_id=flashcard_id)
    ref = (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(FLASHCARDS_SUBCOLLECTION)
        .document(flashcard_id)
    )
    try:
        await ref.update({"favorite": favorite})
    except (GoogleAPICallError, GoogleAuthError) as exc:
        raise _unavailable(exc) from exc
    return card.model_copy(update={"favorite": favorite})
