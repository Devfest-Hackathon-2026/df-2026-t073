from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, Db, HttpClient
from app.schemas.review import (
    ReviewCardResponse,
    ReviewSessionResponse,
    ReviewSummaryResponse,
    SessionResultResponse,
)
from app.services import review

router = APIRouter(prefix="/review", tags=["review"])


@router.get("/card", response_model=ReviewCardResponse)
async def get_review_card(current_user: CurrentUser, db: Db) -> ReviewCardResponse:
    """Today screen: how many Tango are due, from where, and a few to show."""
    return await review.get_review_card(db=db, uid=current_user["uid"])


@router.get("/summary", response_model=ReviewSummaryResponse)
async def get_review_summary(current_user: CurrentUser, db: Db) -> ReviewSummaryResponse:
    """Review tab: due count, collections by place, exercise types."""
    return await review.get_review_summary(db=db, uid=current_user["uid"])


@router.get("/session", response_model=ReviewSessionResponse)
async def start_review_session(
    current_user: CurrentUser,
    db: Db,
    http_client: HttpClient,
    collection: Annotated[
        str | None,
        Query(description="'place:<name>' or 'place-cue'. Omit for everything due."),
    ] = None,
    language: str = "English",
) -> ReviewSessionResponse:
    """Start a session: up to 10 cards, weakest first, as multiple choice and
    fill-the-gap questions. Send answers to POST /flashcards/{id}/review with
    this session_id."""
    return await review.build_session(
        db=db,
        http_client=http_client,
        uid=current_user["uid"],
        collection=collection,
        language=language,
    )


@router.get("/session/{session_id}/result", response_model=SessionResultResponse)
async def get_review_session_result(
    session_id: str,
    current_user: CurrentUser,
    db: Db,
) -> SessionResultResponse:
    """Results screen: cards reviewed, time, biggest win, practice by area."""
    return await review.get_session_result(db=db, uid=current_user["uid"], session_id=session_id)
