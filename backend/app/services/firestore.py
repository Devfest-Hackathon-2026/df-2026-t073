import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import HTTPException, status
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError
from google.cloud.firestore import ArrayUnion, AsyncClient, Query

from app.schemas.capture import CaptureResponse, DetectedItem
from app.schemas.flashcard import (
    Distractors,
    FlashcardResponse,
    GeneratedFlashcardContent,
    HistoryEvent,
    RelatedVocabItem,
    ReviewStats,
    Sighting,
)
from app.schemas.review import ReviewSessionRecord, SessionAnswer
from app.schemas.user import UserProfile
from app.services import tango_rules
from app.services.review_rules import area_of

Rating = Literal["again", "good", "easy"]

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


def next_review_stats(stats: ReviewStats, rating: Rating, now: datetime, strength: int) -> ReviewStats:
    """Schedule the next review. Simple interval doubling (not SM-2); mastered follows strength."""
    count = stats.review_count + 1
    if rating == "again":
        next_due = now + timedelta(minutes=10)
    elif rating == "good":
        next_due = now + timedelta(days=min(30, 2 ** min(count - 1, 4)))
    else:  # "easy"
        next_due = now + timedelta(days=min(60, 4 * max(1, count)))
    return ReviewStats(
        review_count=count,
        last_reviewed_at=now,
        next_review_at=next_due,
        mastered=tango_rules.is_mastered(strength),
    )


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
        use_cases=generated.use_cases,
        related_vocab=[],
        review_stats=ReviewStats(
            review_count=0,
            last_reviewed_at=None,
            next_review_at=now,
            mastered=False,
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
) -> FlashcardResponse:
    """Record that the Tango was found again (re-catch A3, or camera "seen again" B1).

    Recognized: strength +1. Not recognized: treated like a failed review (strength -1).
    With count_as_review, the review schedule moves too.
    """
    now = datetime.now(timezone.utc)
    if recognized:
        strength = tango_rules.apply_sighting(card.strength)
    else:
        strength = tango_rules.apply_review(card.strength, "again")
    event = tango_rules.history_event(
        now=now,
        type="seen_again",
        detail=sighting.place_name,
        sighting_id=sighting.sighting_id,
        strength_after=strength,
    )
    updates: dict[str, Any] = {
        "sightings": ArrayUnion([sighting.model_dump(mode="python")]),
        "history": ArrayUnion([event.model_dump(mode="python")]),
        "strength": strength,
        "review_stats.mastered": tango_rules.is_mastered(strength),
    }
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

    history: list[HistoryEvent] = [e for e in card.history if e.sighting_id != sighting_id]
    strength = history[-1].strength_after if history else 0
    try:
        await _flashcard_ref(db, uid, flashcard_id).update(
            {
                "sightings": [s.model_dump(mode="python") for s in sightings],
                "history": [e.model_dump(mode="python") for e in history],
                "strength": strength,
                "review_stats.mastered": tango_rules.is_mastered(strength),
            }
        )
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to remove sighting %s from %s (uid=%s)", sighting_id, flashcard_id, uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to remove sighting.",
        ) from exc

    stats = card.review_stats.model_copy(update={"mastered": tango_rules.is_mastered(strength)})
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
    if not due_only and mastered is None and not capture_id and not place_id:
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


async def update_flashcard_review(
    *,
    db: AsyncClient,
    uid: str,
    flashcard_id: str,
    rating: Literal["again", "good", "easy"],
    session_id: str | None = None,
) -> FlashcardResponse:
    """Record a review: update strength, schedule the next review, add a history event.

    With a session_id, the answer is also added to that review session.
    """
    card = await get_flashcard(db=db, uid=uid, flashcard_id=flashcard_id)
    now = datetime.now(timezone.utc)
    strength = tango_rules.apply_review(card.strength, rating)
    new_stats = next_review_stats(card.review_stats, rating, now, strength)
    event = tango_rules.history_event(
        now=now,
        type="reviewed",
        detail=rating,
        strength_after=strength,
    )
    try:
        await _flashcard_ref(db, uid, flashcard_id).update(
            {
                "review_stats": new_stats.model_dump(mode="python"),
                "strength": strength,
                "history": ArrayUnion([event.model_dump(mode="python")]),
            }
        )
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to update review stats for %s (uid=%s)", flashcard_id, uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to update flashcard review state.",
        ) from exc

    if session_id:
        answer = SessionAnswer(
            flashcard_id=flashcard_id,
            correct=rating != "again",
            strength_before=card.strength,
            strength_after=strength,
            at=now,
            text=card.kanji,
            reading=card.reading,
            romaji=card.romaji,
            meaning=card.meaning,
            area=area_of(card),
        )
        await record_session_answer(db=db, uid=uid, session_id=session_id, answer=answer)

    return card.model_copy(
        update={"review_stats": new_stats, "strength": strength, "history": [*card.history, event]}
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
) -> None:
    """Cache wrong-answer choices on each card. Best effort: a failure only
    means they get generated again next time."""
    if not distractors:
        return
    batch = db.batch()
    for flashcard_id, d in distractors.items():
        batch.update(_flashcard_ref(db, uid, flashcard_id), {"distractors": d.model_dump(mode="python")})
    try:
        await batch.commit()
    except (GoogleAPICallError, GoogleAuthError):
        logger.exception("Failed to cache distractors for uid=%s", uid)


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
