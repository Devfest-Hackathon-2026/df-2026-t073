from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, Db, HttpClient, daily_limit
from app.schemas.prepare import BriefingResponse
from app.schemas.rehearsal import (
    RehearsalResult,
    RehearsalStartRequest,
    RehearsalStartResponse,
    SaveSentenceRequest,
    SaveSentenceResponse,
    TtsRequest,
    TtsResponse,
    TurnAnswerRequest,
    TurnResult,
)
from app.services import briefing, rehearsal, rehearsal_rules, tts

router = APIRouter(tags=["prepare"])


@router.get(
    "/places/{place_id}/briefing",
    response_model=BriefingResponse,
    dependencies=[daily_limit("briefing")],
)
async def get_briefing(
    place_id: str, current_user: CurrentUser, db: Db, http_client: HttpClient, language: str = "English"
) -> BriefingResponse:
    """What to expect, Tango to know, and anonymous tips. Cached per place for 7 days."""
    try:
        norm_lang = rehearsal_rules.normalize_language(language)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return await briefing.get_briefing(
        db=db, http=http_client, uid=current_user["uid"], place_id=place_id, language=norm_lang
    )


@router.post(
    "/rehearsals",
    response_model=RehearsalStartResponse,
    status_code=201,
    dependencies=[daily_limit("rehearsal")],
)
async def start_rehearsal(
    payload: RehearsalStartRequest, current_user: CurrentUser, db: Db, http_client: HttpClient
) -> RehearsalStartResponse:
    """Start a role-play for a place. The script is written once per place and reused."""
    try:
        norm_lang = rehearsal_rules.normalize_language(payload.language)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return await rehearsal.start_rehearsal(
        db=db, http=http_client, uid=current_user["uid"], place_id=payload.place_id, language=norm_lang
    )


@router.post(
    "/rehearsals/{rehearsal_id}/turns/{turn_id}",
    response_model=TurnResult,
    dependencies=[daily_limit("reply")],
)
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


@router.post("/rehearsals/{rehearsal_id}/turns/{turn_id}/save", response_model=SaveSentenceResponse)
async def save_sentence(
    rehearsal_id: str, turn_id: str, payload: SaveSentenceRequest, current_user: CurrentUser, db: Db
) -> SaveSentenceResponse:
    """Save what was said (or the suggested version) to each Tango that appears in it."""
    return await rehearsal.save_sentence(
        db=db,
        uid=current_user["uid"],
        rehearsal_id=rehearsal_id,
        turn_id=turn_id,
        use_suggestion=payload.use_suggestion,
    )


@router.post("/speech/tts", response_model=TtsResponse, dependencies=[daily_limit("tts")])
async def staff_audio(payload: TtsRequest, _user: CurrentUser, http_client: HttpClient) -> TtsResponse:
    """Spoken staff line (Japanese). Each text and speed is synthesized once, then served from storage."""
    return TtsResponse(audio_url=await tts.staff_audio_url(http=http_client, text=payload.text, speed=payload.speed))
