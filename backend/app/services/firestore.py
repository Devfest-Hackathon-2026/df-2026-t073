import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import HTTPException, status
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError
from google.cloud.firestore import AsyncClient, Query

from app.schemas.capture import CaptureResponse, DetectedItem
from app.schemas.flashcard import (
    FlashcardResponse,
    GeneratedFlashcardContent,
    RelatedVocabItem,
    ReviewStats,
)
from app.schemas.user import UserProfile

logger = logging.getLogger(__name__)

USERS_COLLECTION = "users"
CAPTURES_SUBCOLLECTION = "captures"
FLASHCARDS_SUBCOLLECTION = "flashcards"


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
) -> CaptureResponse:
    """Store a processed image capture and its Vision detections in users/{uid}/captures/{capture_id}."""
    now = datetime.now(timezone.utc)
    capture = CaptureResponse(
        capture_id=capture_id,
        image_url=image_url,
        detected_items=detected_items,
        created_at=now,
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


def make_flashcard_id(capture_id: str, target_word: str) -> str:
    """Build a deterministic flashcard ID per (capture_id, target_word) to prevent duplicates."""
    digest = hashlib.sha256(f"{capture_id}:{target_word.strip().lower()}".encode("utf-8")).hexdigest()
    return f"fc_{digest[:20]}"


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
) -> FlashcardResponse:
    """Save a newly generated flashcard to users/{uid}/flashcards/{flashcard_id}."""
    now = datetime.now(timezone.utc)
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
        use_cases=generated.use_cases,
        related_vocab=[],
        review_stats=ReviewStats(
            review_count=0,
            last_reviewed_at=None,
            next_review_at=now,
            mastered=False,
        ),
        created_at=now,
    )
    doc_ref = (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(FLASHCARDS_SUBCOLLECTION)
        .document(flashcard_id)
    )
    try:
        await doc_ref.set(card.model_dump(mode="python"))
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to save flashcard %s for uid=%s", flashcard_id, uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to save flashcard to Firestore.",
        ) from exc
    return card


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
    limit: int = 100,
) -> list[FlashcardResponse]:
    """List the user's flashcards, filtering in memory to avoid composite index requirements."""
    col_ref: Any = (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(FLASHCARDS_SUBCOLLECTION)
        .order_by("created_at", direction=Query.DESCENDING)
    )
    if not due_only and mastered is None and not capture_id:
        col_ref = col_ref.limit(limit)
    now = datetime.now(timezone.utc)
    try:
        cards: list[FlashcardResponse] = []
        async for doc in col_ref.stream():
            data = doc.to_dict()
            if not data:
                continue
            card = FlashcardResponse.model_validate(data)
            if capture_id and card.capture_id != capture_id:
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
) -> FlashcardResponse:
    """Update spaced-repetition review statistics for a flashcard."""
    card = await get_flashcard(db=db, uid=uid, flashcard_id=flashcard_id)
    now = datetime.now(timezone.utc)
    count = card.review_stats.review_count + 1

    if rating == "again":
        next_due = now + timedelta(minutes=10)
        mastered = False
    elif rating == "good":
        days = min(30, 2 ** min(count - 1, 4))
        next_due = now + timedelta(days=days)
        mastered = count >= 4
    else:  # "easy"
        days = min(60, 4 * max(1, count))
        next_due = now + timedelta(days=days)
        mastered = count >= 2

    new_stats = ReviewStats(
        review_count=count,
        last_reviewed_at=now,
        next_review_at=next_due,
        mastered=mastered,
    )
    doc_ref = (
        db.collection(USERS_COLLECTION)
        .document(uid)
        .collection(FLASHCARDS_SUBCOLLECTION)
        .document(flashcard_id)
    )
    try:
        await doc_ref.update({"review_stats": new_stats.model_dump(mode="python")})
    except (GoogleAPICallError, GoogleAuthError) as exc:
        logger.exception("Failed to update review stats for %s (uid=%s)", flashcard_id, uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to update flashcard review state.",
        ) from exc

    card.review_stats = new_stats
    return card


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
