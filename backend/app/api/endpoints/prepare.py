from fastapi import APIRouter

from app.api.deps import CurrentUser, Db, HttpClient
from app.schemas.prepare import BriefingResponse
from app.schemas.rehearsal import (
    RehearsalResult,
    RehearsalStartRequest,
    RehearsalStartResponse,
    TtsRequest,
    TtsResponse,
    TurnAnswerRequest,
    TurnResult,
)
from app.services import briefing, rehearsal, tts

router = APIRouter(tags=["prepare"])


@router.get("/places/{place_id}/briefing", response_model=BriefingResponse)
async def get_briefing(
    place_id: str, current_user: CurrentUser, db: Db, http_client: HttpClient, language: str = "English"
) -> BriefingResponse:
    """What to expect, Tango to know, and anonymous tips. Cached per place for 7 days."""
    return await briefing.get_briefing(
        db=db, http=http_client, uid=current_user["uid"], place_id=place_id, language=language
    )


@router.post("/rehearsals", response_model=RehearsalStartResponse, status_code=201)
async def start_rehearsal(
    payload: RehearsalStartRequest, current_user: CurrentUser, db: Db, http_client: HttpClient
) -> RehearsalStartResponse:
    """Start a role-play for a place. The script is written once per place and reused."""
    return await rehearsal.start_rehearsal(
        db=db, http=http_client, uid=current_user["uid"], place_id=payload.place_id, language=payload.language
    )


@router.post("/rehearsals/{rehearsal_id}/turns/{turn_id}", response_model=TurnResult)
async def answer_turn(
    rehearsal_id: str,
    turn_id: str,
    payload: TurnAnswerRequest,
    current_user: CurrentUser,
    db: Db,
    http_client: HttpClient,
) -> TurnResult:
    """Answer a staff line: a spoken reply (audio, rated by Gemini) or one of the 3 choices."""
    return await rehearsal.answer_turn(
        db=db, http=http_client, uid=current_user["uid"], rehearsal_id=rehearsal_id, turn_id=turn_id, answer=payload
    )


@router.get("/rehearsals/{rehearsal_id}/results", response_model=RehearsalResult)
async def get_results(rehearsal_id: str, current_user: CurrentUser, db: Db) -> RehearsalResult:
    return await rehearsal.get_results(db=db, uid=current_user["uid"], rehearsal_id=rehearsal_id)


@router.post("/speech/tts", response_model=TtsResponse)
async def staff_audio(payload: TtsRequest, _user: CurrentUser, http_client: HttpClient) -> TtsResponse:
    """Spoken staff line (Japanese). Each text and speed is synthesized once, then served from storage."""
    return TtsResponse(audio_url=await tts.staff_audio_url(http=http_client, text=payload.text, speed=payload.speed))
