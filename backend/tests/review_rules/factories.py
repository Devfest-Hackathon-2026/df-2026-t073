from datetime import datetime, timedelta, timezone

from app.schemas.capture import Vertex
from app.schemas.flashcard import (
    CaptureFormat,
    FlashcardResponse,
    QuestionType,
    ReviewStage,
    ReviewStats,
    Sighting,
    TangoKind,
    UseCaseExample,
)

NOW = datetime(2026, 11, 8, 12, 0, tzinfo=timezone.utc)


def card(
    card_id: str,
    *,
    kanji: str = "食券",
    reading: str = "しょっけん",
    romaji: str = "shokken",
    meaning: str = "meal ticket",
    synonyms: list[str] | None = None,
    kind: TangoKind = "word",
    capture_format: CaptureFormat | None = None,
    strength: int = 0,
    stage: ReviewStage | None = None,
    stage_streak: int = 0,
    miss_streak: int = 0,
    last_question_type: QuestionType | None = None,
    due_in: timedelta = timedelta(0),
    places: tuple[str, ...] = ("Koenji",),
    image: bool = False,
) -> FlashcardResponse:
    return FlashcardResponse(
        flashcard_id=card_id,
        capture_id="cap" if image else "",
        image_url="https://example.com/p.jpg" if image else "",
        bounding_box=[Vertex(x=0.4, y=0.4), Vertex(x=0.6, y=0.5)] if image else [],
        kanji=kanji,
        reading=reading,
        romaji=romaji,
        meaning=meaning,
        meaning_synonyms=synonyms or [],
        part_of_speech="Noun",
        kind=kind,
        capture_format=capture_format,
        use_cases=[
            UseCaseExample(
                japanese=f"{kanji}をお願いします。",
                reading=f"{reading}をおねがいします。",
                english="Ticket, please.",
            )
        ],
        review_stats=ReviewStats(
            next_review_at=NOW + due_in,
            stage=stage,
            stage_streak=stage_streak,
            miss_streak=miss_streak,
            last_question_type=last_question_type,
        ),
        created_at=NOW,
        strength=strength,
        sightings=[
            Sighting(sighting_id=f"s{i}", place_name=p, seen_at=NOW - timedelta(days=i))
            for i, p in enumerate(places)
        ],
    )
