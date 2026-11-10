import logging
from datetime import UTC, datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError
from google.cloud.firestore import ArrayUnion, AsyncClient, Query

from app.schemas.capture import CaptureResponse, DetectedItem, Vertex
from app.schemas.flashcard import (
    CaptureFormat,
    Distractors,
    FlashcardResponse,
    GeneratedFlashcardContent,
    HistoryEvent,
    QuestionType,
    RelatedVocabItem,
    ReviewStats,
    SavedSentence,
    Sighting,
)
from app.schemas.review import (
    ExerciseKey,
    ReviewSessionRecord,
    SessionAnswer,
    SessionAnswerRequest,
)
from app.schemas.review_types import Rating
from app.schemas.user import UserProfile
from app.services import tango_rules
from app.services.review_rules.answers import (
    AnswerOutcome,
    apply_answer,
    apply_session_answer,
)
from app.services.review_rules.exercises import backfill_photo_fields
from app.services.review_rules.scheduling import next_review_stats
from app.services.review_rules.selection import area_of

logger = logging.getLogger(__name__)

USERS_COLLECTION = "users"
CAPTURES_SUBCOLLECTION = "captures"
FLASHCARDS_SUBCOLLECTION = "flashcards"
REVIEW_SESSIONS_SUBCOLLECTION = "review_sessions"


async def sync_user_profile(
    db: AsyncClient, decoded_claims: dict[str, Any]
) -> UserProfile:
    """Return the user's profile and store it in Firestore when the token's claims changed.

    The response comes entirely from the verified token, so a Firestore error
    is logged and does not fail the request.
    """
    uid = decoded_claims["uid"]
    profile_data = {
        "uid": uid,
        "email": decoded_claims.get("email"),
        "name": decoded_claims.get("name"),
        "picture": decoded_claims.get("picture"),
        "email_verified": bool(decoded_claims.get("email_verified", False)),
    }

    doc_ref = db.collection(USERS_COLLECTION).document(uid)
    try:
        # A read is cheaper than a write and avoids write contention on the doc.
        snapshot = await doc_ref.get()
        stored = snapshot.to_dict() or {}
        if any(stored.get(k) != v for k, v in profile_data.items()):
            await doc_ref.set(profile_data, merge=True)
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Failed to sync profile for uid=%s", uid)

    return UserProfile(**profile_data)


async def save_capture(
    *,
    db: AsyncClient,
    uid: str,
    capture_id: str,
    image_url: str,
    detected_items: list[DetectedItem],
    place_id: str | None = None,
    place_name: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
) -> CaptureResponse:
    """Store a processed image capture and its Vision detections in users/{uid}/captures/{capture_id}."""
    now = datetime.now(timezone.utc)
    capture = CaptureResponse(
        capture_id=capture_id,
        image_url=image_url,
        detected_items=detected_items,
        created_at=now,
        place_id=place_id,
        place_name=place_name,
        lat=lat,
        lng=lng,
    )
    doc_ref = (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(CAPTURES_SUBCOLLECTION)
        .document(capture_id)
    )
    try:
        await doc_ref.set(capture.model_dump(mode="python"))
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to save capture %s for uid=%s", capture_id, uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to save capture to Firestore.",
        ) from exc
    return capture


async def get_capture(
    *,
    db: AsyncClient,
    uid: str,
    capture_id: str,
) -> CaptureResponse:
    """Fetch a single capture document for the authenticated user."""
    doc_ref = (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(CAPTURES_SUBCOLLECTION)
        .document(capture_id)
    )
    try:
        snapshot = await doc_ref.get()
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to read capture %s for uid=%s", capture_id, uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to read capture from Firestore.",
        ) from exc

    if not snapshot.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Capture '{capture_id}' not found.",
        )
    return CaptureResponse.model_validate(snapshot.to_dict())


async def list_captures(
    *,
    db: AsyncClient,
    uid: str,
    limit: int = 50,
) -> list[CaptureResponse]:
    """List recent captures for the authenticated user ordered by created_at descending."""
    col_ref = (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(CAPTURES_SUBCOLLECTION)
        .order_by("created_at", direction=Query.DESCENDING)
        .limit(limit)
    )
    try:
        results: list[CaptureResponse] = []
        async for doc in col_ref.stream():
            data = doc.to_dict()
            if data:
                results.append(CaptureResponse.model_validate(data))
        return results
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to list captures for uid=%s", uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to list captures from Firestore.",
        ) from exc


def _flashcard_ref(db: AsyncClient, uid: str, flashcard_id: str) -> Any:
    return (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(FLASHCARDS_SUBCOLLECTION)
        .document(flashcard_id)
    )


def make_flashcard_id(uid: str, target_word: str) -> str:
    """One card per user and word, wherever it was found (see tango_rules)."""
    return tango_rules.make_flashcard_id(uid, target_word)


async def get_flashcard_if_exists(
    *,
    db: AsyncClient,
    uid: str,
    flashcard_id: str,
) -> FlashcardResponse | None:
    """Return an existing flashcard if already created, avoiding duplicate LLM calls and writes."""
    doc_ref = (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(FLASHCARDS_SUBCOLLECTION)
        .document(flashcard_id)
    )
    try:
        snapshot = await doc_ref.get()
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to check flashcard %s for uid=%s", flashcard_id, uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to read flashcard from Firestore.",
        ) from exc

    if not snapshot.exists:
        return None
    return FlashcardResponse.model_validate(snapshot.to_dict())


async def save_use_cases(*, db: AsyncClient, uid: str, flashcard_id: str, use_cases: list[Any]) -> None:
    """Adds example sentences to a card saved from the dictionary (written later by Gemini)."""
    await _flashcard_ref(db, uid, flashcard_id).update(
        {"use_cases": [u.model_dump(mode="python") if hasattr(u, "model_dump") else u for u in use_cases]}
    )


async def save_flashcard(
    *,
    db: AsyncClient,
    uid: str,
    flashcard_id: str,
    capture_id: str,
    item_id: str | None,
    image_url: str,
    bounding_box: list[Any],
    generated: GeneratedFlashcardContent,
    sighting: Sighting,
    capture_format: CaptureFormat = "text",
) -> FlashcardResponse:
    """Save a newly generated flashcard to users/{uid}/flashcards/{flashcard_id}."""
    now = datetime.now(timezone.utc)
    caught = tango_rules.history_event(
        now=now,
        type="caught",
        detail=sighting.place_name,
        sighting_id=sighting.sighting_id,
        strength_after=0,
    )
    card = FlashcardResponse(
        flashcard_id=flashcard_id,
        capture_id=capture_id,
        item_id=item_id,
        image_url=image_url,
        bounding_box=bounding_box,
        kanji=generated.kanji,
        reading=generated.reading,
        romaji=generated.romaji,
        meaning=generated.meaning,
        part_of_speech=generated.part_of_speech,
        kind=generated.kind,
        capture_format=capture_format,
        use_cases=generated.use_cases,
        related_vocab=[],
        review_stats=ReviewStats(
            review_count=0,
            last_reviewed_at=None,
            next_review_at=now,
            mastered=False,
            stage="flashcard",
            stage_streak=0,
            miss_streak=0,
        ),
        created_at=now,
        strength=0,
        sightings=[sighting],
        history=[caught],
    )
    try:
        await _flashcard_ref(db, uid, flashcard_id).set(card.model_dump(mode="python"))
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to save flashcard %s for uid=%s", flashcard_id, uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to save flashcard to Firestore.",
        ) from exc
    return card


async def add_sighting(
    *,
    db: AsyncClient,
    uid: str,
    card: FlashcardResponse,
    sighting: Sighting,
    recognized: bool = True,
    count_as_review: bool = False,
    bounding_box: list[Vertex] | None = None,
) -> FlashcardResponse:
    """Record that the Tango was found again (re-catch A3, or camera "seen again" B1).

    Recognized: strength +1. Not recognized: treated like a failed review (strength -1).
    With count_as_review, the review schedule moves too.
    If the card had no photo and this sighting comes from a photo, backfill the photo.
    """
    now = datetime.now(timezone.utc)
    if recognized:
        if tango_rules.can_increase_strength_from_sighting(card.sightings, sighting.place_id, now):
            strength = tango_rules.apply_sighting(card.strength)
        else:
            strength = card.strength
    else:
        strength = tango_rules.apply_review(card.strength, "again")
    event = tango_rules.history_event(
        now=now,
        type="seen_again",
        detail=sighting.place_name,
        sighting_id=sighting.sighting_id,
        strength_after=strength,
        review_stats_before=card.review_stats if count_as_review else None,
    )
    backfill = backfill_photo_fields(card, sighting, bounding_box)
    updates: dict[str, Any] = {
        "sightings": ArrayUnion([sighting.model_dump(mode="python")]),
        "history": ArrayUnion([event.model_dump(mode="python")]),
        "strength": strength,
        "review_stats.mastered": tango_rules.is_mastered(strength),
    }
    if backfill:
        updates["image_url"] = backfill["image_url"]
        updates["capture_id"] = backfill["capture_id"]
        if "bounding_box" in backfill:
            updates["bounding_box"] = [v.model_dump(mode="python") for v in backfill["bounding_box"]]
    stats = card.review_stats.model_copy(update={"mastered": tango_rules.is_mastered(strength)})
    if count_as_review:
        stats = next_review_stats(card.review_stats, "good" if recognized else "again", now, strength)
        updates["review_stats"] = stats.model_dump(mode="python")
        del updates["review_stats.mastered"]
    try:
        await _flashcard_ref(db, uid, card.flashcard_id).update(updates)
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to add sighting to %s (uid=%s)", card.flashcard_id, uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to record sighting.",
        ) from exc

    return card.model_copy(
        update={
            **backfill,
            "strength": strength,
            "review_stats": stats,
            "sightings": [*card.sightings, sighting],
            "history": [*card.history, event],
        }
    )


async def remove_sighting(
    *,
    db: AsyncClient,
    uid: str,
    flashcard_id: str,
    sighting_id: str,
) -> FlashcardResponse | None:
    """Undo one catch: drop the sighting and its history event.

    Deletes the card if that was its only sighting and returns None.
    Strength goes back to the value after the last remaining event.
    """
    card = await get_flashcard(db=db, uid=uid, flashcard_id=flashcard_id)
    if not any(s.sighting_id == sighting_id for s in card.sightings):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sighting '{sighting_id}' not found on flashcard '{flashcard_id}'.",
        )
    sightings = [s for s in card.sightings if s.sighting_id != sighting_id]
    if not sightings:
        await delete_flashcard(db=db, uid=uid, flashcard_id=flashcard_id)
        return None

    removed_event = next((e for e in card.history if e.sighting_id == sighting_id), None)
    history: list[HistoryEvent] = [e for e in card.history if e.sighting_id != sighting_id]
    strength = history[-1].strength_after if history else 0
    if removed_event and removed_event.review_stats_before is not None:
        stats = removed_event.review_stats_before.model_copy(
            update={"mastered": tango_rules.is_mastered(strength)}
        )
    else:
        stats = card.review_stats.model_copy(update={"mastered": tango_rules.is_mastered(strength)})

    try:
        await _flashcard_ref(db, uid, flashcard_id).update(
            {
                "sightings": [s.model_dump(mode="python") for s in sightings],
                "history": [e.model_dump(mode="python") for e in history],
                "strength": strength,
                "review_stats": stats.model_dump(mode="python"),
            }
        )
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to remove sighting %s from %s (uid=%s)", sighting_id, flashcard_id, uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to remove sighting.",
        ) from exc

    return card.model_copy(
        update={"sightings": sightings, "history": history, "strength": strength, "review_stats": stats}
    )


async def get_flashcard(
    *,
    db: AsyncClient,
    uid: str,
    flashcard_id: str,
) -> FlashcardResponse:
    """Fetch a single flashcard by ID or raise 404."""
    card = await get_flashcard_if_exists(db=db, uid=uid, flashcard_id=flashcard_id)
    if card is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Flashcard '{flashcard_id}' not found.",
        )
    return card


async def list_flashcards(
    *,
    db: AsyncClient,
    uid: str,
    due_only: bool = False,
    mastered: bool | None = None,
    capture_id: str | None = None,
    place_id: str | None = None,
    since: datetime | None = None,
    limit: int = 100,
) -> list[FlashcardResponse]:
    """List the user's flashcards, filtering in memory to avoid composite index requirements.

    The limit applies to the filtered result.
    """
    col_ref: Any = (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(FLASHCARDS_SUBCOLLECTION)
        .order_by("created_at", direction=Query.DESCENDING)
    )
    if not due_only and mastered is None and not capture_id and not place_id and since is None:
        col_ref = col_ref.limit(limit)
    now = datetime.now(timezone.utc)
    try:
        cards: list[FlashcardResponse] = []
        async for doc in col_ref.stream():
            data = doc.to_dict()
            if not data:
                continue
            card = FlashcardResponse.model_validate(data)
            if capture_id and not (
                card.capture_id == capture_id
                or any(s.capture_id == capture_id for s in card.sightings)
            ):
                continue
            if place_id and not any(s.place_id == place_id for s in card.sightings):
                continue
            if mastered is not None and card.review_stats.mastered != mastered:
                continue
            if due_only:
                due_at = card.review_stats.next_review_at
                if due_at.tzinfo is None:
                    due_at = due_at.replace(tzinfo=timezone.utc)
                if due_at > now:
                    continue
            if since:
                since_utc = since if since.tzinfo else since.replace(tzinfo=timezone.utc)
                timestamps = [card.created_at]
                if card.review_stats.last_reviewed_at:
                    timestamps.append(card.review_stats.last_reviewed_at)
                for s in card.sightings:
                    timestamps.append(s.seen_at)
                for h in card.history:
                    timestamps.append(h.at)
                latest_activity = max(
                    (t if t.tzinfo else t.replace(tzinfo=timezone.utc))
                    for t in timestamps
                )
                if latest_activity <= since_utc:
                    continue
            cards.append(card)
            if len(cards) >= limit:
                break
        return cards
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to list flashcards for uid=%s", uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to list flashcards from Firestore.",
        ) from exc


def _session_answer(
    card: FlashcardResponse, correct: bool, strength_after: int, now: datetime
) -> SessionAnswer:
    return SessionAnswer(
        flashcard_id=card.flashcard_id,
        correct=correct,
        strength_before=card.strength,
        strength_after=strength_after,
        at=now,
        text=card.kanji,
        reading=card.reading,
        romaji=card.romaji,
        meaning=card.meaning,
        area=area_of(card),
    )


async def update_flashcard_review(
    *,
    db: AsyncClient,
    uid: str,
    flashcard_id: str,
    rating: Rating | None = None,
    correct: bool | None = None,
    answer_text: str | None = None,
    question_type: QuestionType | None = None,
    session_id: str | None = None,
) -> FlashcardResponse:
    """Record a review: update strength, stage progression, schedule next review, add history.

    With a session_id, the answer is also added to that review session.
    """
    card = await get_flashcard(db=db, uid=uid, flashcard_id=flashcard_id)
    now = datetime.now(timezone.utc)
    outcome = apply_answer(
        card,
        now,
        rating=rating,
        correct=correct,
        answer_text=answer_text,
        question_type=question_type,
    )
    return await _save_outcome(
        db=db,
        uid=uid,
        card=card,
        outcome=outcome,
        question_type=question_type,
        session_id=session_id,
        now=now,
    )


async def record_keyed_answer(
    *,
    db: AsyncClient,
    uid: str,
    session_id: str,
    key: ExerciseKey,
    answer: SessionAnswerRequest,
) -> AnswerOutcome:
    """Record a session answer graded against its stored question (the answer key)."""
    card = await get_flashcard(db=db, uid=uid, flashcard_id=key.flashcard_id)
    now = datetime.now(UTC)
    outcome = apply_session_answer(card, key, answer, now)
    await _save_outcome(
        db=db,
        uid=uid,
        card=card,
        outcome=outcome,
        question_type=key.question_type,
        session_id=session_id,
        now=now,
    )
    return outcome


async def _save_outcome(
    *,
    db: AsyncClient,
    uid: str,
    card: FlashcardResponse,
    outcome: AnswerOutcome,
    question_type: QuestionType | None,
    session_id: str | None,
    now: datetime,
) -> FlashcardResponse:
    """Write an answer's outcome to the card (unless stale) and to its session.

    Returns the card as it is now.
    """
    flashcard_id = card.flashcard_id
    if outcome.event is None:
        # Stale: the card moved to another stage since this question was built.
        logger.info("Ignoring stale %s answer for %s (uid=%s)", question_type, flashcard_id, uid)
    else:
        try:
            await _flashcard_ref(db, uid, flashcard_id).update(
                {
                    "review_stats": outcome.stats.model_dump(mode="python"),
                    "strength": outcome.strength,
                    "history": ArrayUnion([outcome.event.model_dump(mode="python")]),
                }
            )
        except (GoogleAPICallError, GoogleAuthError) as exc:
            logger.exception("Failed to update review stats for %s (uid=%s)", flashcard_id, uid)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Failed to update flashcard review state.",
            ) from exc

    if session_id:
        await record_session_answer(
            db=db,
            uid=uid,
            session_id=session_id,
            answer=_session_answer(card, outcome.correct, outcome.strength, now),
        )

    if outcome.event is None:
        return card
    return card.model_copy(
        update={
            "review_stats": outcome.stats,
            "strength": outcome.strength,
            "history": [*card.history, outcome.event],
        }
    )


def _session_ref(db: AsyncClient, uid: str, session_id: str) -> Any:
    return (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(REVIEW_SESSIONS_SUBCOLLECTION)
        .document(session_id)
    )


async def create_review_session(
    *, db: AsyncClient, uid: str, record: ReviewSessionRecord
) -> None:
    try:
        await _session_ref(db, uid, record.session_id).set(record.model_dump(mode="python"))
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to save review session for uid=%s", uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to start review session.",
        ) from exc


async def get_review_session(
    *, db: AsyncClient, uid: str, session_id: str
) -> ReviewSessionRecord:
    try:
        snapshot = await _session_ref(db, uid, session_id).get()
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to read review session %s for uid=%s", session_id, uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to read review session.",
        ) from exc
    if not snapshot.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Review session '{session_id}' not found.",
        )
    return ReviewSessionRecord.model_validate(snapshot.to_dict())


async def record_session_answer(
    *, db: AsyncClient, uid: str, session_id: str, answer: SessionAnswer
) -> None:
    """Add an answer to its session. A missing session is logged, not fatal:
    the review itself was already saved."""
    try:
        await _session_ref(db, uid, session_id).update(
            {"answers": ArrayUnion([answer.model_dump(mode="python")])}
        )
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Failed to record answer in session %s (uid=%s)", session_id, uid)


async def save_distractors(
    *, db: AsyncClient, uid: str, distractors: dict[str, Distractors]
) -> bool:
    """Cache wrong-answer choices and meaning synonyms on each card.

    Each Distractors.synonyms must be the card's full synonym list (its current ones plus
    new ones); it replaces meaning_synonyms so the stored list matches what exercises accept.
    Best effort: returns False on failure (they get generated again next time).
    """
    if not distractors:
        return True
    try:
        batch = db.batch()
        for flashcard_id, d in distractors.items():
            updates: dict[str, Any] = {"distractors": d.model_dump(mode="python")}
            if d.synonyms:
                updates["meaning_synonyms"] = list(d.synonyms)
            batch.set(_flashcard_ref(db, uid, flashcard_id), updates, merge=True)
        await batch.commit()
        return True
    except (GoogleAPICallError, GoogleAuthError, Exception):
        logger.warning("Batch distractor save failed for uid=%s; attempting individual saves", uid)
        any_success = False
        for flashcard_id, d in distractors.items():
            updates = {"distractors": d.model_dump(mode="python")}
            if d.synonyms:
                updates["meaning_synonyms"] = list(d.synonyms)
            try:
                await _flashcard_ref(db, uid, flashcard_id).set(updates, merge=True)
                any_success = True
            except Exception:
                logger.warning("Failed to update distractors on card %s for uid=%s", flashcard_id, uid)
        return any_success


async def save_related_vocab(
    *,
    db: AsyncClient,
    uid: str,
    flashcard_id: str,
    related_vocab: list[RelatedVocabItem],
) -> list[RelatedVocabItem]:
    """Cache generated related vocabulary items on the flashcard document."""
    doc_ref = (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(FLASHCARDS_SUBCOLLECTION)
        .document(flashcard_id)
    )
    try:
        await doc_ref.update(
            {"related_vocab": [item.model_dump(mode="python") for item in related_vocab]}
        )
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to save related vocab for %s (uid=%s)", flashcard_id, uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to save related vocabulary.",
        ) from exc
    return related_vocab


async def delete_flashcard(
    *,
    db: AsyncClient,
    uid: str,
    flashcard_id: str,
) -> None:
    """Delete a flashcard document owned by the authenticated user."""
    await get_flashcard(db=db, uid=uid, flashcard_id=flashcard_id)
    doc_ref = (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(FLASHCARDS_SUBCOLLECTION)
        .document(flashcard_id)
    )
    try:
        await doc_ref.delete()
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to delete flashcard %s for uid=%s", flashcard_id, uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to delete flashcard.",
        ) from exc


async def add_saved_sentence(
    *, db: AsyncClient, uid: str, flashcard_id: str, sentence: SavedSentence
) -> None:
    """Add a rehearsal sentence to a Tango's "Your sentences"."""
    try:
        await _flashcard_ref(db, uid, flashcard_id).update(
            {"saved_sentences": ArrayUnion([sentence.model_dump(mode="python")])}
        )
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to save sentence to %s (uid=%s)", flashcard_id, uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to save the sentence.",
        ) from exc


async def add_history_events(
    *, db: AsyncClient, uid: str, flashcard_id: str, events: list[HistoryEvent]
) -> None:
    """Append "How it grew" events that don't change strength or the schedule. Best effort."""
    try:
        await _flashcard_ref(db, uid, flashcard_id).update(
            {"history": ArrayUnion([e.model_dump(mode="python") for e in events])}
        )
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Failed to add history to %s (uid=%s)", flashcard_id, uid)


async def remove_saved_sentence(
    *, db: AsyncClient, uid: str, flashcard_id: str, sentence_id: str
) -> FlashcardResponse:
    """Remove one saved sentence from a Tango. Returns the updated card."""
    card = await get_flashcard(db=db, uid=uid, flashcard_id=flashcard_id)
    kept = [s for s in card.saved_sentences if s.sentence_id != sentence_id]
    try:
        await _flashcard_ref(db, uid, flashcard_id).update(
            {"saved_sentences": [s.model_dump(mode="python") for s in kept]}
        )
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to remove sentence from %s (uid=%s)", flashcard_id, uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to remove the sentence.",
        ) from exc
    return card.model_copy(update={"saved_sentences": kept})
