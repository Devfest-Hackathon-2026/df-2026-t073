"""Word of the day on Today: picked for the user's level and interests.

Interests come from what Today already loads: the kinds of places in upcoming
visits and where the user's Tango were caught. No AI calls; readings and
meanings come from JMdict. The same word stays all day (seeded by user + date).
"""

import hashlib
from collections import Counter
from dataclasses import dataclass
from datetime import date

from app.services import dictionary
from app.services.everyday_words import CATEGORY_TOPICS, WORDS

# Profile reading level -> hardest word level shown.
LEVEL_CAP = {"none": 1, "kana": 1, "some_kanji": 2, "most": 3}
DEFAULT_LEVEL = 2
NEXT_VISIT_BOOST = 6.0
OTHER_VISIT_BOOST = 2.0
CAUGHT_BOOST = 1.0
MAX_CAUGHT_BOOST = 4.0

TOPIC_NAMES = {
    "food": "food",
    "shopping": "shopping",
    "transport": "train and bus",
    "signs": "sign",
    "lodging": "hotel and bath",
    "sightseeing": "sightseeing",
    "health": "help",
    "greetings": "everyday",
}


@dataclass(frozen=True)
class Pick:
    text: str
    topic: str
    reason: str


def topic_for_category(category: str) -> str | None:
    low = category.lower()
    for keywords, topic in CATEGORY_TOPICS:
        if any(k in low for k in keywords):
            return topic
    return None


def interest_weights(
    *, next_visit_category: str | None, other_visit_categories: list[str], caught_categories: list[str]
) -> dict[str, float]:
    """1.0 for every topic, plus boosts from plans and catches."""
    weights = {topic: 1.0 for _, _, topic in WORDS}
    if next_visit_category and (topic := topic_for_category(next_visit_category)):
        weights[topic] += NEXT_VISIT_BOOST
    for category in other_visit_categories:
        if topic := topic_for_category(category):
            weights[topic] += OTHER_VISIT_BOOST
    caught = Counter(t for c in caught_categories if (t := topic_for_category(c)))
    for topic, count in caught.items():
        weights[topic] += min(MAX_CAUGHT_BOOST, CAUGHT_BOOST * count)
    return weights


def _seeded_unit(seed: str) -> float:
    """A stable number in [0, 1) for a seed string."""
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") / 2**64


def pick_word(
    *,
    reading_level: str | None,
    weights: dict[str, float],
    owned: set[str],
    seed: str,
    next_visit_name: str | None = None,
    next_visit_category: str | None = None,
) -> Pick | None:
    """Weighted, stable pick: level-appropriate, not already owned."""
    cap = LEVEL_CAP.get(reading_level or "", DEFAULT_LEVEL)
    candidates: list[tuple[str, str, float]] = []
    for text, level, topic in WORDS:
        if level > cap or text in owned:
            continue
        # Words at the user's own level are preferred over easier ones.
        level_weight = 2.0 if level == cap else 1.0
        candidates.append((text, topic, weights.get(topic, 1.0) * level_weight))
    if not candidates:
        return None
    total = sum(w for _, _, w in candidates)
    target = _seeded_unit(seed) * total
    for text, topic, weight in candidates:
        target -= weight
        if target < 0:
            break
    next_topic = topic_for_category(next_visit_category) if next_visit_category else None
    if next_visit_name and topic == next_topic:
        reason = f"For your visit to {next_visit_name}"
    elif weights.get(topic, 1.0) > 1.0:
        reason = f"You've been catching {TOPIC_NAMES.get(topic, topic)} words"
    else:
        reason = "An everyday word for your level"
    return Pick(text=text, topic=topic, reason=reason)


def seed_for(uid: str, day: date) -> str:
    return f"{uid}:{day.isoformat()}"


def word_card(pick: Pick) -> dictionary.DictCard | None:
    return dictionary.lookup(pick.text)
