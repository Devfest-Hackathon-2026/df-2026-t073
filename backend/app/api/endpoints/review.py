from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, Db, HttpClient, daily_limit
from app.schemas.review import (
    AnswerVerdict,
    ReviewCardResponse,
    ReviewSessionResponse,
    ReviewSummaryResponse,
    SessionAnswerRequest,
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


@router.get("/session", response_model=ReviewSessionResponse, dependencies=[daily_limit("review")])
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
    fill-the-gap questions. Send answers to
    POST /review/session/{session_id}/answers."""
    return await review.build_session(
        db=db,
        http_client=http_client,
        uid=current_user["uid"],
        collection=collection,
        language=language,
    )


@router.post("/session/{session_id}/answers", response_model=AnswerVerdict)
async def answer_review_question(
    session_id: str,
    payload: SessionAnswerRequest,
    current_user: CurrentUser,
    db: Db,
) -> AnswerVerdict:
    """Answer one question of a session. Graded against the question as it was asked
    (saved when the session started), then recorded on the card and in the session.

    409 for sessions started before answer keys were saved; 422 when the answer kind
    doesn't fit the question (e.g. "pick" for fill-in-the-blank).
    """
    return await review.answer_question(
        db=db, uid=current_user["uid"], session_id=session_id, answer=payload
    )


@router.get("/session/{session_id}/result", response_model=SessionResultResponse)
async def get_review_session_result(
    session_id: str,
    current_user: CurrentUser,
    db: Db,
) -> SessionResultResponse:
    """Results screen: cards reviewed, time, biggest win, practice by area."""
    return await review.get_session_result(db=db, uid=current_user["uid"], session_id=session_id)
