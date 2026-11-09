"""When a card is due next after a review or a sighting."""

from datetime import datetime, timedelta

from app.schemas.review_types import Rating, ReviewStats
from app.services import tango_rules


def next_review_stats(
    stats: ReviewStats, rating: Rating, now: datetime, strength: int
) -> ReviewStats:
    """Schedule the next review. Simple interval doubling (not SM-2); mastered follows strength."""
    count = stats.review_count + 1
    if rating == "again":
        next_due = now + timedelta(minutes=10)
    elif rating == "good":
        next_due = now + timedelta(days=min(30, 2 ** min(count - 1, 4)))
    else:  # "easy"
        next_due = now + timedelta(days=min(60, 4 * max(1, count)))
    return stats.model_copy(
        update={
            "review_count": count,
            "last_reviewed_at": now,
            "next_review_at": next_due,
            "mastered": tango_rules.is_mastered(strength),
        }
    )
