"""Card-level accessors for capture format and the card's review stage."""

from app.schemas.flashcard import (
    CaptureFormat,
    FlashcardResponse,
)
from app.schemas.review_types import ReviewStage
from app.services.review_rules.stages import has_usable_photo


def card_has_photo(card: FlashcardResponse) -> bool:
    """True when the card has an uploaded capture photo and a usable bounding box."""
    return has_usable_photo(card.image_url, card.bounding_box)


def capture_format(card: FlashcardResponse) -> CaptureFormat:
    """Whether the Tango was captured via object recognition or OCR text.

    FlashcardResponse.populate_defaults always sets it.
    """
    assert card.capture_format is not None
    return card.capture_format


def uses_object_questions(card: FlashcardResponse) -> bool:
    """Object questions use the photo as their only prompt, so they need a usable photo.

    Object cards without one get the text questions instead.
    """
    return capture_format(card) == "object" and card_has_photo(card)


def effective_stage(card: FlashcardResponse) -> ReviewStage:
    """The card's active review stage.

    FlashcardResponse.populate_defaults always sets it, inferred for older cards and
    normalized for the card's format and photo.
    """
    assert card.review_stats.stage is not None
    return card.review_stats.stage
