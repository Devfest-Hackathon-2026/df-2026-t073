"""Rehearsal: a role-play script per place (cached, shared), sessions, and rated replies.

Script: one Gemini call per place and language, ever (cached).
Replies: by choice = no calls; spoken = one Gemini call with the audio.
"""

import base64
import binascii
import logging
import uuid
from datetime import UTC, datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException, status
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError
from google.cloud.firestore import AsyncClient

from app.schemas.rehearsal import (
    RehearsalResult,
    RehearsalScript,
    RehearsalSession,
    RehearsalStartResponse,
    SaveSentenceResponse,
    TurnAnswerRequest,
    TurnResult,
)
from app.services import places
from app.services import rehearsal_rules as rules
from app.services import stt
from app.services.firestore import USERS_COLLECTION, add_saved_sentence, list_flashcards
from app.services.gemini import generate_json, jp_schema

logger = logging.getLogger(__name__)

SESSIONS_SUBCOLLECTION = "rehearsals"
# Enough for a hackathon-sized collection; sentences match against all the user's Tango.
MAX_CARDS = 1000
MAX_AUDIO_BYTES = 2 * 1024 * 1024  # ~1 minute of AAC; replies are a few seconds
AUDIO_MIME_TYPES = {"audio/amr-wb", "audio/3gpp", "audio/aac", "audio/mp4", "audio/m4a", "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm"}

_choice = {
    "type": "OBJECT",
    "properties": {
        **jp_schema()["properties"],
        "ok": {"type": "BOOLEAN"},
        "label": {"type": "STRING"},
        "note": {"type": "STRING"},
        "why_suggestion": {"type": "STRING"},
    },
    "required": ["text", "reading", "romaji", "meaning", "ok", "label", "note", "why_suggestion"],
}
SCRIPT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "staff_voice": {"type": "STRING"},
        "exchanges": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "staff": jp_schema(),
                    "model_reply": jp_schema(),
                    "hint": {"type": "STRING"},
                    "choices": {"type": "ARRAY", "items": _choice},
                },
                "required": ["staff", "model_reply", "hint", "choices"],
            },
        },
    },
    "required": ["staff_voice", "exchanges"],
}
RATING_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "transcript": jp_schema(),
        "understood": {"type": "BOOLEAN"},
        "ok": {"type": "BOOLEAN"},
        "label": {"type": "STRING"},
        "note": {"type": "STRING"},
        "why_suggestion": {"type": "STRING"},
    },
    "required": ["transcript", "understood", "ok", "label", "note", "why_suggestion"],
}


def _script_prompt(name: str, category: str, language: str) -> str:
    return (
        "Write a short role-play for a Japanese learner visiting this place in Japan: "
        f"{name} ({category}).\n"
        "- exactly 3 exchanges, in the order they really happen (greeting/ordering, a typical "
        "question from staff, paying or leaving).\n"
        "- staff: what staff actually say there (natural shop Japanese, polite keigo).\n"
        "- model_reply: a short, natural, polite reply a learner could say.\n"
        f"- hint: one sentence in {language} explaining what staff asked and how to answer.\n"
        "- choices: exactly 3 replies the learner might give: one natural (ok=true), one "
        "understandable but unnatural (ok=false), one that misunderstands the question (ok=false). "
        f"label: 2-5 words in {language} (e.g. 'Natural and polite', 'Understood, but stiff'). "
        f"note: one sentence in {language} on why. why_suggestion: one sentence in {language} on "
        "why the model reply is better (empty for the natural one).\n"
        f"- every Japanese phrase has hiragana reading, Hepburn romaji and meaning in {language}.\n"
        "- staff_voice: a short description of the staff member, e.g. 'Counter staff, friendly'."
    )


def _script_ref(db: AsyncClient, place_id: str, language: str) -> Any:
    return db.collection(places.PLACES_COLLECTION).document(place_id).collection("rehearsal").document(language.lower())


def _session_ref(db: AsyncClient, uid: str, rehearsal_id: str) -> Any:
    return db.collection(USERS_COLLECTION).document(uid).collection(SESSIONS_SUBCOLLECTION).document(rehearsal_id)


async def _script(db: AsyncClient, http: httpx.AsyncClient, place_id: str, name: str, category: str, language: str) -> RehearsalScript:
    ref = _script_ref(db, place_id, language)
    try:
        snap = await ref.get()
        if snap.exists:
            return RehearsalScript.model_validate(snap.to_dict())
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Rehearsal cache read failed for %s", place_id)
    raw = await generate_json(http=http, prompt=_script_prompt(name, category, language), schema=SCRIPT_SCHEMA, temperature=0.5)
    try:
        script = rules.parse_script(raw, seed=place_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Gemini returned an unusable script.") from exc
    script = script.model_copy(update={"generated_at": datetime.now(timezone.utc)})
    try:
        await ref.set(script.model_dump(mode="python"))
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Rehearsal cache write failed for %s", place_id)
    return script


async def start_rehearsal(
    *, db: AsyncClient, http: httpx.AsyncClient, uid: str, place_id: str, language: str
) -> RehearsalStartResponse:
    place = await places.get_place(http=http, db=db, place_id=place_id)
    script = await _script(db, http, place.id, f"{place.name.text} {place.name.meaning or ''}".strip(), place.category, language)
    session = RehearsalSession(
        rehearsal_id=f"rh_{uuid.uuid4().hex[:16]}",
        place=place,
        language=language,
        turns=script.turns,
        started_at=datetime.now(timezone.utc),
    )
    try:
        await _session_ref(db, uid, session.rehearsal_id).set(session.model_dump(mode="python"))
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to start rehearsal for uid=%s", uid)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Failed to start rehearsal.") from exc
    return RehearsalStartResponse(
        rehearsal_id=session.rehearsal_id, place=place, staff_voice=script.staff_voice, turns=script.turns
    )


async def _session(db: AsyncClient, uid: str, rehearsal_id: str) -> RehearsalSession:
    try:
        snap = await _session_ref(db, uid, rehearsal_id).get()
    except (GoogleAPICallError, GoogleAuthError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Failed to read rehearsal.") from exc
    if not snap.exists:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Rehearsal '{rehearsal_id}' not found.")
    return RehearsalSession.model_validate(snap.to_dict())


def _decode_audio(answer: TurnAnswerRequest) -> tuple[bytes, str]:
    mime = answer.mime_type.lower().split(";", 1)[0].strip()
    if mime not in AUDIO_MIME_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=f"Unsupported audio type '{mime}'.")
    try:
        data = base64.b64decode(answer.audio_base64 or "", validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Audio is not valid base64.") from exc
    if not data or len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, detail="Recording is empty or too long.")
    return data, mime


async def answer_turn(
    *, db: AsyncClient, http: httpx.AsyncClient, uid: str, rehearsal_id: str, turn_id: str, answer: TurnAnswerRequest
) -> TurnResult:
    session = await _session(db, uid, rehearsal_id)
    turn = next((t for t in session.turns if t.id == turn_id and t.speaker == "user"), None)
    if turn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Turn '{turn_id}' not found.")

    if answer.choice_index is not None:
        if answer.choice_index >= len(turn.choices):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No such choice.")
        result = rules.result_from_choice(session.turns, turn, answer.choice_index)
    else:
        audio, mime = _decode_audio(answer)
        staff = rules.staff_before(session.turns, turn_id)
        # Speech-to-Text writes down what was said; Gemini only rates that text.
        heard = await stt.transcribe(http=http, audio=audio, mime=mime)
        if not heard:
            raw: dict[str, Any] = {"transcript": {"text": ""}, "understood": False}
        else:
            prompt = (
                "A Japanese learner answered a shop staff member out loud.\n"
                f"Staff said: {staff.text} ({staff.meaning or ''})\n"
                f"The learner was guided to say something like: {turn.jp.text} ({turn.jp.meaning or ''})\n"
                f"Speech recognition heard the learner say: {heard}\n"
                "transcript: copy that text exactly as given (do not correct it), and add its "
                f"hiragana reading, Hepburn romaji and meaning in {session.language}.\n"
                "understood=true.\n"
                "ok=true if a staff member would understand it and it fits the situation politely enough. "
                "The guided reply is only a suggestion: a different reply, a slightly off-script one, "
                "or a fair question of their own is fine. ok=false only if staff wouldn't understand it, "
                "it's rude, or it has nothing to do with the conversation.\n"
                f"label: 2-5 words in {session.language}. note: one encouraging sentence in "
                f"{session.language}. why_suggestion: one sentence on what would sound more natural "
                "(empty if ok)."
            )
            raw = await generate_json(http=http, prompt=prompt, schema=RATING_SCHEMA, temperature=0.1)
            # Never let the rater rewrite what was actually said.
            transcript = raw.get("transcript") if isinstance(raw.get("transcript"), dict) else {}
            if transcript.get("text") != heard:
                transcript = {"text": heard}
            raw["transcript"] = transcript
        result = rules.result_from_audio(session.turns, turn, raw)

    try:
        await _session_ref(db, uid, rehearsal_id).update({f"answers.{turn_id}": result.model_dump(mode="python")})
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Failed to store answer for %s/%s", rehearsal_id, turn_id)
    return result


async def get_results(*, db: AsyncClient, uid: str, rehearsal_id: str) -> RehearsalResult:
    session = await _session(db, uid, rehearsal_id)
    cards = await list_flashcards(db=db, uid=uid, limit=MAX_CARDS)
    lines = [
        rules.result_line(session.answers[t.id], cards)
        for t in session.turns
        if t.id in session.answers
    ]
    return RehearsalResult(place=session.place, lines=lines)


async def save_sentence(
    *, db: AsyncClient, uid: str, rehearsal_id: str, turn_id: str, use_suggestion: bool
) -> SaveSentenceResponse:
    """Save a rehearsal line to every Tango that appears in it (once per Tango)."""
    session = await _session(db, uid, rehearsal_id)
    result = session.answers.get(turn_id)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"No answer for turn '{turn_id}'.")
    sentence = rules.sentence_to_save(
        result,
        use_suggestion=use_suggestion,
        rehearsal_id=rehearsal_id,
        place_name=session.place.name.text,
        sentence_id=f"sn_{uuid.uuid4().hex[:12]}",
        now=datetime.now(UTC),
    )
    if sentence is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="This line has no suggested version.")
    cards = await list_flashcards(db=db, uid=uid, limit=MAX_CARDS)
    matches = rules.tango_in(sentence.text, cards)
    by_id = {c.flashcard_id: c for c in cards}
    for match in matches:
        if not rules.already_saved(by_id[match.flashcard_id], sentence):
            await add_saved_sentence(db=db, uid=uid, flashcard_id=match.flashcard_id, sentence=sentence)
    return SaveSentenceResponse(saved_to=matches)
