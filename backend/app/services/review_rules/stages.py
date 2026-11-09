"""Review stage machine: the stage path per format, promotion and demotion.

Imports only leaf schema modules, because the FlashcardResponse validator uses
these rules to fill in and normalize each card's stage.
"""

from app.schemas.capture import Vertex
from app.schemas.review_types import (
    CaptureFormat,
    QuestionType,
    ReviewStage,
    ReviewStats,
)

# Stage progression thresholds (consecutive correct answers to promote, misses to demote).
PROMOTE: dict[ReviewStage, int] = {
    "flashcard": 2,
    "mcq_photo": 2,
    "mcq": 3,
}


DEMOTE_MISSES = 2


STAGE_ORDER: dict[ReviewStage, int] = {
    "flashcard": 0,
    "mcq_photo": 1,
    "mcq": 2,
    "fill": 3,
}


def stage_path(fmt: CaptureFormat, has_photo: bool = True) -> tuple[ReviewStage, ...]:
    """Ordered review stages for a card's format and photo availability."""
    if fmt == "object" or not has_photo:
        return ("flashcard", "mcq", "fill")
    return ("flashcard", "mcq_photo", "mcq", "fill")


def next_stage(
    stats: ReviewStats,
    fmt: CaptureFormat,
    correct: bool,
    *,
    has_photo: bool = True,
    question_type: QuestionType | None = None,
) -> ReviewStats:
    """Advance or demote one step along the card's stage path; streaks reset on stage change."""
    path = stage_path(fmt, has_photo)
    current: ReviewStage = stats.stage or "flashcard"
    if current not in path:
        current = "mcq" if current == "mcq_photo" else "flashcard"
    idx = path.index(current)

    if correct:
        streak = stats.stage_streak + 1
        need = PROMOTE.get(current)
        if need is not None and streak >= need and idx + 1 < len(path):
            new_stage = path[idx + 1]
            stage_streak = 0
        else:
            new_stage = current
            stage_streak = streak
        miss_streak = 0
    else:
        misses = stats.miss_streak + 1
        if misses >= DEMOTE_MISSES and idx > 0:
            new_stage = path[idx - 1]
            miss_streak = 0
        else:
            new_stage = current
            miss_streak = misses
        stage_streak = 0

    return stats.model_copy(
        update={
            "stage": new_stage,
            "stage_streak": stage_streak,
            "miss_streak": miss_streak,
            "last_question_type": (
                question_type if question_type is not None else stats.last_question_type
            ),
        }
    )


def shows_photo(stage: ReviewStage, fmt: CaptureFormat, has_photo: bool = True) -> bool:
    """Whether an exercise at this stage and format renders the capture photo."""
    if not has_photo:
        return False
    if fmt == "object":
        return True
    return stage in ("flashcard", "mcq_photo")


def has_usable_photo(image_url: str, bounding_box: list[Vertex]) -> bool:
    """True when there is an uploaded capture photo and a usable bounding box."""
    return bool(image_url) and len(bounding_box) >= 2


def infer_stage(strength: int, fmt: CaptureFormat, photo: bool = True) -> "ReviewStage":
    """Starting stage for older cards that have no stored stage."""
    if strength <= 1:
        return "flashcard"
    if strength == 2:
        return "mcq_photo" if (fmt == "text" and photo) else "mcq"
    if strength == 3:
        return "mcq"
    return "fill"


def normalize_stage(
    stage: "ReviewStage", fmt: CaptureFormat, photo: bool
) -> "ReviewStage":
    """The photo MCQ stage only exists for text cards with a photo; otherwise it is plain mcq.

    A photo added later (backfill) does not move a card back from mcq to mcq_photo:
    mcq_photo is the easier stage, so progress already made is kept.
    """
    if stage == "mcq_photo" and (fmt == "object" or not photo):
        return "mcq"
    return stage
