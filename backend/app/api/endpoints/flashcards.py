from datetime import datetime, timezone
from typing import Annotated

import logging

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Response, status
from google.cloud.firestore import AsyncClient

from app.api.deps import CurrentUser, Db, HttpClient, daily_limit
from app.schemas.capture import DetectedItem, Vertex
from app.schemas.flashcard import (
    FlashcardCatchResponse,
    GeneratedFlashcardContent,
    FlashcardCreateRequest,
    FlashcardResponse,
    FlashcardReviewRequest,
    RelatedVocabItem,
    SightingCreateRequest,
)
from app.schemas.lists import FlashcardUpdateRequest
from app.services import dictionary, lists, tango_rules
from app.services.firestore import (
    add_sighting,
    delete_flashcard,
    get_capture,
    get_flashcard,
    get_flashcard_if_exists,
    list_flashcards,
    make_flashcard_id,
    remove_sighting,
    save_flashcard,
    save_use_cases,
    save_related_vocab,
    update_flashcard_review,
)
from app.services.flashcard_generator import (
    generate_flashcard_content,
    generate_related_vocabulary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


def _from_dictionary(target_word: str, item_type: str, language: str) -> GeneratedFlashcardContent | None:
    """A card straight from JMdict (instant, free), or None to ask Gemini.

    JMdict meanings are English, so other explanation languages use Gemini.
    """
    if language.strip().lower() != "english":
        return None
    card = dictionary.lookup(target_word)
    if card is None:
        return None
    kind = "object" if item_type == "object" else ("phrase" if card.is_phrase else "word")
    return GeneratedFlashcardContent(
        kanji=card.text,
        reading=card.reading,
        romaji=card.romaji,
        meaning=card.meaning,
        part_of_speech=card.part_of_speech,
        kind=kind,
        use_cases=[],
    )


async def _fill_examples(
    *,
    db: AsyncClient,
    http_client: httpx.AsyncClient,
    uid: str,
    flashcard_id: str,
    target_word: str,
    source_label: str,
    item_type: str,
    language: str,
) -> None:
    """After the catch has returned: Gemini writes the example sentences."""
    try:
        generated = await generate_flashcard_content(
            http_client=http_client,
            target_word=target_word,
            source_label=source_label,
            item_type=item_type,
            language=language,
        )
        await save_use_cases(db=db, uid=uid, flashcard_id=flashcard_id, use_cases=generated.use_cases)
    except Exception:  # noqa: BLE001 - a background extra; the card is already saved.
        logger.exception("Could not add examples to %s", flashcard_id)


@router.post(
    "/generate",
    response_model=FlashcardCatchResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[daily_limit("catch")],
)
async def create_flashcard(
    payload: FlashcardCreateRequest,
    current_user: CurrentUser,
    db: Db,
    http_client: HttpClient,
    background: BackgroundTasks,
) -> FlashcardCatchResponse:
    """Catch a Tango from a selected object or text in a captured picture,
    or from text read live on the phone (no capture_id, no photo).

    One card per user and word: catching a word that already has a card adds a
    sighting (place and time) to it instead of creating a duplicate.
    """
    uid = current_user["uid"]
    capture = (
        await get_capture(db=db, uid=uid, capture_id=payload.capture_id)
        if payload.capture_id
        else None
    )

    matched_item: DetectedItem | None = None
    if capture is not None and payload.item_id:
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

    # Place: request first, then whatever was stored with the capture.
    if capture is not None:
        sighting = tango_rules.new_sighting(
            now=capture.created_at,
            capture_id=capture.capture_id,
            place_id=payload.place_id or capture.place_id,
            place_name=payload.place_name or capture.place_name,
            lat=payload.lat if payload.lat is not None else capture.lat,
            lng=payload.lng if payload.lng is not None else capture.lng,
            image_url=capture.image_url,
        )
    else:
        sighting = tango_rules.new_sighting(
            now=datetime.now(timezone.utc),
            capture_id=None,
            place_id=payload.place_id,
            place_name=payload.place_name,
            lat=payload.lat,
            lng=payload.lng,
        )

    flashcard_id = make_flashcard_id(uid, target_word)
    existing = await get_flashcard_if_exists(db=db, uid=uid, flashcard_id=flashcard_id)
    if existing is not None:
        if payload.only_if_new:
            return FlashcardCatchResponse(card=existing, created=False, sighting_id="")
        card = await add_sighting(db=db, uid=uid, card=existing, sighting=sighting)
        return FlashcardCatchResponse(card=card, created=False, sighting_id=sighting.sighting_id)

    source_label = matched_item.source_label if matched_item else target_word
    item_type = matched_item.item_type if matched_item else "text"
    bounding_box: list[Vertex] = matched_item.bounding_box if matched_item else []

    # Dictionary words are saved at once; Gemini adds examples afterwards.
    generated = _from_dictionary(target_word, item_type, payload.language)
    if generated is not None:
        background.add_task(
            _fill_examples,
            db=db,
            http_client=http_client,
            uid=uid,
            flashcard_id=flashcard_id,
            target_word=target_word,
            source_label=source_label,
            item_type=item_type,
            language=payload.language,
        )
    else:
        generated = await generate_flashcard_content(
            http_client=http_client,
            target_word=target_word,
            source_label=source_label,
            item_type=item_type,
            language=payload.language,
        )

    card = await save_flashcard(
        db=db,
        uid=uid,
        flashcard_id=flashcard_id,
        # Live catches have no photo; Review skips the photo question for them.
        capture_id=capture.capture_id if capture else "",
        item_id=matched_item.item_id if matched_item else payload.item_id,
        image_url=capture.image_url if capture else "",
        bounding_box=bounding_box,
        generated=generated,
        sighting=sighting,
    )
    return FlashcardCatchResponse(card=card, created=True, sighting_id=sighting.sighting_id)


@router.get("", response_model=list[FlashcardResponse])
async def get_user_flashcards(
    current_user: CurrentUser,
    db: Db,
    due_only: bool = False,
    mastered: bool | None = None,
    capture_id: str | None = None,
    place_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[FlashcardResponse]:
    """List saved flashcards, optionally filtered by due status, capture or place."""
    return await list_flashcards(
        db=db,
        uid=current_user["uid"],
        due_only=due_only,
        mastered=mastered,
        capture_id=capture_id,
        place_id=place_id,
        limit=limit,
    )


@router.patch("/{flashcard_id}", response_model=FlashcardResponse)
async def update_flashcard(
    flashcard_id: str,
    payload: FlashcardUpdateRequest,
    current_user: CurrentUser,
    db: Db,
) -> FlashcardResponse:
    """Mark or unmark a Tango as a favourite."""
    uid = current_user["uid"]
    if payload.favorite is None:
        return await get_flashcard(db=db, uid=uid, flashcard_id=flashcard_id)
    return await lists.set_favorite(db=db, uid=uid, flashcard_id=flashcard_id, favorite=payload.favorite)


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
    """Record a flashcard review result ('again', 'good', 'easy') and schedule the next review.

    Pass session_id when answering inside a review session, so it shows up in the results.
    """
    return await update_flashcard_review(
        db=db,
        uid=current_user["uid"],
        flashcard_id=flashcard_id,
        rating=payload.rating,
        session_id=payload.session_id,
    )


@router.post("/{flashcard_id}/expand", response_model=list[RelatedVocabItem])
async def expand_flashcard_vocabulary(
    flashcard_id: str,
    current_user: CurrentUser,
    db: Db,
    http_client: HttpClient,
    refresh: bool = False,
    language: str = "English",
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
        language=language,
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


@router.post(
    "/{flashcard_id}/sightings",
    response_model=FlashcardCatchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_flashcard_sighting(
    flashcard_id: str,
    payload: SightingCreateRequest,
    current_user: CurrentUser,
    db: Db,
) -> FlashcardCatchResponse:
    """The camera spotted a Tango you already have ("seen again").

    Adds a sighting and counts as a review: recognized moves strength up,
    not recognized moves it down and brings the review sooner.
    """
    uid = current_user["uid"]
    card = await get_flashcard(db=db, uid=uid, flashcard_id=flashcard_id)
    sighting = tango_rules.new_sighting(
        now=datetime.now(timezone.utc),
        capture_id=payload.capture_id,
        place_id=payload.place_id,
        place_name=payload.place_name,
        lat=payload.lat,
        lng=payload.lng,
    )
    updated = await add_sighting(
        db=db,
        uid=uid,
        card=card,
        sighting=sighting,
        recognized=payload.recognized,
        count_as_review=True,
    )
    return FlashcardCatchResponse(card=updated, created=False, sighting_id=sighting.sighting_id)


@router.delete(
    "/{flashcard_id}/sightings/{sighting_id}",
    response_model=FlashcardResponse | None,
)
async def remove_flashcard_sighting(
    flashcard_id: str,
    sighting_id: str,
    current_user: CurrentUser,
    db: Db,
) -> FlashcardResponse | None:
    """Undo one catch. Returns the updated card, or null if the card was deleted
    because that was its only sighting."""
    return await remove_sighting(
        db=db,
        uid=current_user["uid"],
        flashcard_id=flashcard_id,
        sighting_id=sighting_id,
    )
