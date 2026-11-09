"""Review: what's due, the Review tab summary, sessions and their results."""

import uuid
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException, status
from google.cloud.firestore import AsyncClient

from app.schemas.flashcard import FlashcardResponse
from app.schemas.review import (
    AnswerVerdict,
    Collection,
    ExerciseType,
    ReviewCardResponse,
    ReviewSessionRecord,
    ReviewSessionResponse,
    ReviewSummaryResponse,
    SessionAnswerRequest,
    SessionResultResponse,
)
from app.services.review_rules.answers import answer_fits
from app.services.review_rules.distractors import complete_distractors, needs_distractors
from app.services.review_rules.exercises import build_exercise, exercise_key
from app.services.review_rules.grading import merge_synonyms
from app.services.review_rules.results import answered_by_area, areas_summary, biggest_win, exercise_types_summary, session_minutes
from app.services.review_rules.selection import AREA_PREFIX, FAVORITES_COLLECTION, LIST_PREFIX, PLACE_CUE_COLLECTION, PLACE_PREFIX, SESSION_SIZE, area_of, estimate_minutes, is_due, order_session_cards, pick_session_cards
from app.services.lists import get_list, list_lists
from app.services.firestore import (
    create_review_session,
    get_review_session,
    list_flashcards,
    record_keyed_answer,
    save_distractors,
)
from app.services.flashcard_generator import generate_distractors
from app.services.places import areas_for

# Enough for a hackathon-sized collection; all review screens look at the whole set.
MAX_CARDS = 200
SAMPLE_SIZE = 4

EXERCISE_TYPES = [
    ExerciseType(id="flashcard", label="Flashcard", enabled=True, count=0),
    ExerciseType(id="mcq", label="Multiple choice", enabled=True, count=0),
    ExerciseType(id="fill", label="Fill in the blank", enabled=True, count=0),
]


async def _all_cards(db: AsyncClient, uid: str) -> list[FlashcardResponse]:
    return await list_flashcards(db=db, uid=uid, limit=MAX_CARDS)


def _due(cards: list[FlashcardResponse], now: datetime) -> list[FlashcardResponse]:
    due = [c for c in cards if is_due(c, now)]
    due.sort(key=lambda c: (c.strength, c.review_stats.next_review_at))
    return due


async def get_review_card(*, db: AsyncClient, uid: str) -> ReviewCardResponse:
    now = datetime.now(timezone.utc)
    due = _due(await _all_cards(db, uid), now)
    return ReviewCardResponse(
        due_count=len(due),
        minutes=estimate_minutes(min(len(due), SESSION_SIZE)),
        areas=[a.area for a in areas_summary(due)][:3],
        sample=due[:SAMPLE_SIZE],
        more_count=max(0, len(due) - SAMPLE_SIZE),
    )


async def get_review_summary(*, db: AsyncClient, uid: str) -> ReviewSummaryResponse:
    now = datetime.now(timezone.utc)
    cards = await _all_cards(db, uid)
    due = _due(cards, now)
    place_cue = [c for c in due if area_of(c)]
    collections = [
        Collection(
            id=f"{PLACE_PREFIX}{a.area}",
            label=a.area,
            count=a.count,
            is_place=True,
            is_place_cue=False,
        )
        for a in areas_summary(cards)
    ]
    favorites = [c for c in cards if c.favorite]
    if favorites:
        collections.insert(
            0,
            Collection(
                id=FAVORITES_COLLECTION,
                label="Favourites",
                count=len(favorites),
                is_place=False,
                is_place_cue=False,
                is_favorites=True,
            ),
        )
    owned = {c.flashcard_id for c in cards}
    for user_list in await list_lists(db=db, uid=uid):
        collections.append(
            Collection(
                id=f"{LIST_PREFIX}{user_list.list_id}",
                label=user_list.name,
                count=sum(1 for i in user_list.tango_ids if i in owned),
                is_place=False,
                is_place_cue=False,
                is_list=True,
            )
        )
    if place_cue:
        collections.append(
            Collection(
                id=PLACE_CUE_COLLECTION,
                label="Place cue",
                count=len(place_cue),
                is_place=False,
                is_place_cue=True,
            )
        )
    return ReviewSummaryResponse(
        due_count=len(due),
        minutes=estimate_minutes(min(len(due), SESSION_SIZE)),
        place_cue_count=len(place_cue),
        collections=collections,
        exercise_types=exercise_types_summary(cards),
        total_tango=len(cards),
    )


async def build_session(
    *,
    db: AsyncClient,
    http_client: httpx.AsyncClient,
    uid: str,
    collection: str | None = None,
    language: str = "English",
) -> ReviewSessionResponse:
    """Pick cards, make sure each has wrong answers, build questions, save the session."""
    now = datetime.now(timezone.utc)
    cards = await _all_cards(db, uid)
    area_by_place: dict[str, str] | None = None
    if collection and collection.startswith(AREA_PREFIX):
        place_ids = {s.place_id for c in cards for s in c.sightings if s.place_id}
        area_by_place = await areas_for(db, place_ids)
    list_ids: set[str] | None = None
    if collection and collection.startswith(LIST_PREFIX):
        chosen = await get_list(db=db, uid=uid, list_id=collection[len(LIST_PREFIX) :])
        list_ids = set(chosen.tango_ids)
    picked = order_session_cards(
        pick_session_cards(
            cards, now, collection, area_by_place=area_by_place, list_ids=list_ids
        )
    )
    session_id = f"rs_{uuid.uuid4().hex[:16]}"

    # One Gemini call for every card that has no cached wrong answers or lacks needed readings.
    missing = {c.flashcard_id: c for c in picked if needs_distractors(c)}
    raw = await generate_distractors(
        http_client=http_client, cards=list(missing.values()), language=language
    )
    # The stored synonym list = the card's current ones plus the new ones. Exercises
    # accept card.meaning_synonyms, which must match what the server grades against.
    generated = {
        fid: d.model_copy(
            update={"synonyms": merge_synonyms(missing[fid].meaning_synonyms, d.synonyms)}
        )
        for fid, d in raw.items()
        if fid in missing
    }
    saved = await save_distractors(db=db, uid=uid, distractors=generated)

    exercises = []
    for position, card in enumerate(picked):
        found = generated.get(card.flashcard_id)
        if found is not None and saved:
            # Exercises accept card.meaning_synonyms, so use the list just stored.
            card = card.model_copy(update={"meaning_synonyms": found.synonyms})
        distractors = complete_distractors(card, found or card.distractors, cards)
        exercises.append(build_exercise(card, distractors, position, session_id))

    await create_review_session(
        db=db,
        uid=uid,
        record=ReviewSessionRecord(
            session_id=session_id,
            flashcard_ids=[c.flashcard_id for c in picked],
            collection=collection,
            started_at=now,
            exercises=[exercise_key(e) for e in exercises],
        ),
    )
    return ReviewSessionResponse(session_id=session_id, exercises=exercises)


async def answer_question(
    *, db: AsyncClient, uid: str, session_id: str, answer: SessionAnswerRequest
) -> AnswerVerdict:
    """Grade one session answer against the question that was asked, and record it."""
    record = await get_review_session(db=db, uid=uid, session_id=session_id)
    if not record.exercises:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This session was started before answers were graded per question.",
        )
    key = next((k for k in record.exercises if k.exercise_id == answer.exercise_id), None)
    if key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Exercise '{answer.exercise_id}' is not in this session.",
        )
    if not answer_fits(key, answer):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"A '{answer.kind}' answer doesn't fit a {key.question_type} question.",
        )
    outcome = await record_keyed_answer(
        db=db, uid=uid, session_id=session_id, key=key, answer=answer
    )
    return AnswerVerdict(exercise_id=key.exercise_id, correct=outcome.correct, stale=outcome.stale)


async def get_session_result(*, db: AsyncClient, uid: str, session_id: str) -> SessionResultResponse:
    record = await get_review_session(db=db, uid=uid, session_id=session_id)
    return SessionResultResponse(
        reviewed=len({a.flashcard_id for a in record.answers}),
        minutes=session_minutes(record.started_at, record.answers),
        biggest_win=biggest_win(record.answers),
        by_area=answered_by_area(record.answers),
    )
