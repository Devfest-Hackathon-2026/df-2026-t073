from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.api.deps import CurrentUser, Db, HttpClient
from app.schemas.capture import DetectedItem, Vertex
from app.schemas.flashcard import (
    FlashcardCreateRequest,
    FlashcardResponse,
    FlashcardReviewRequest,
    RelatedVocabItem,
)
from app.services.firestore import (
    delete_flashcard,
    get_capture,
    get_flashcard,
    get_flashcard_if_exists,
    list_flashcards,
    make_flashcard_id,
    save_flashcard,
    save_related_vocab,
    update_flashcard_review,
)
from app.services.flashcard_generator import (
    generate_flashcard_content,
    generate_related_vocabulary,
)

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


@router.post(
    "/generate",
    response_model=FlashcardResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_flashcard(
    payload: FlashcardCreateRequest,
    current_user: CurrentUser,
    db: Db,
    http_client: HttpClient,
) -> FlashcardResponse:
    """Generate a review flashcard from a selected object or text in a captured picture."""
    uid = current_user["uid"]
    capture = await get_capture(db=db, uid=uid, capture_id=payload.capture_id)

    matched_item: DetectedItem | None = None
    if payload.item_id:
        matched_item = next(
            (item for item in capture.detected_items if item.item_id == payload.item_id),
            None,
        )
        if matched_item is None and not payload.selected_text:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Item '{payload.item_id}' not found in capture '{payload.capture_id}'.",
            )

    target_word = (
        payload.selected_text.strip()
        if payload.selected_text and payload.selected_text.strip()
        else (matched_item.japanese_text if matched_item else "")
    )
    if not target_word:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No target word or object could be resolved for flashcard generation.",
        )

    # Deduplicate: return existing flashcard if already generated for this (capture_id, target_word)
    flashcard_id = make_flashcard_id(payload.capture_id, target_word)
    existing = await get_flashcard_if_exists(db=db, uid=uid, flashcard_id=flashcard_id)
    if existing is not None:
        return existing

    source_label = matched_item.source_label if matched_item else target_word
    item_type = matched_item.item_type if matched_item else "text"
    bounding_box: list[Vertex] = matched_item.bounding_box if matched_item else []

    generated = await generate_flashcard_content(
        http_client=http_client,
        target_word=target_word,
        source_label=source_label,
        item_type=item_type,
    )

    return await save_flashcard(
        db=db,
        uid=uid,
        flashcard_id=flashcard_id,
        capture_id=capture.capture_id,
        item_id=matched_item.item_id if matched_item else payload.item_id,
        image_url=capture.image_url,
        bounding_box=bounding_box,
        generated=generated,
    )


@router.get("", response_model=list[FlashcardResponse])
async def get_user_flashcards(
    current_user: CurrentUser,
    db: Db,
    due_only: bool = False,
    mastered: bool | None = None,
    capture_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[FlashcardResponse]:
    """List saved flashcards for later review, optionally filtered by due status or capture."""
    return await list_flashcards(
        db=db,
        uid=current_user["uid"],
        due_only=due_only,
        mastered=mastered,
        capture_id=capture_id,
        limit=limit,
    )


@router.get("/{flashcard_id}", response_model=FlashcardResponse)
async def get_single_flashcard(
    flashcard_id: str,
    current_user: CurrentUser,
    db: Db,
) -> FlashcardResponse:
    """Get a single flashcard by ID."""
    return await get_flashcard(
        db=db, uid=current_user["uid"], flashcard_id=flashcard_id
    )


@router.post("/{flashcard_id}/review", response_model=FlashcardResponse)
async def review_flashcard(
    flashcard_id: str,
    payload: FlashcardReviewRequest,
    current_user: CurrentUser,
    db: Db,
) -> FlashcardResponse:
    """Record a flashcard review result ('again', 'good', 'easy') and schedule the next review."""
    return await update_flashcard_review(
        db=db,
        uid=current_user["uid"],
        flashcard_id=flashcard_id,
        rating=payload.rating,
    )


@router.post("/{flashcard_id}/expand", response_model=list[RelatedVocabItem])
async def expand_flashcard_vocabulary(
    flashcard_id: str,
    current_user: CurrentUser,
    db: Db,
    http_client: HttpClient,
    refresh: bool = False,
) -> list[RelatedVocabItem]:
    """Extend a flashcard lesson with contextually related Japanese vocabulary words."""
    uid = current_user["uid"]
    card = await get_flashcard(db=db, uid=uid, flashcard_id=flashcard_id)
    if card.related_vocab and not refresh:
        return card.related_vocab

    related = await generate_related_vocabulary(
        http_client=http_client,
        kanji=card.kanji,
        meaning=card.meaning,
    )
    return await save_related_vocab(
        db=db,
        uid=uid,
        flashcard_id=flashcard_id,
        related_vocab=related,
    )


@router.delete("/{flashcard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_flashcard(
    flashcard_id: str,
    current_user: CurrentUser,
    db: Db,
) -> Response:
    """Delete a flashcard."""
    await delete_flashcard(
        db=db, uid=current_user["uid"], flashcard_id=flashcard_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)

