from app.schemas.place import WordReason
from app.services.everyday_words import WORDS
from app.services.word_of_day import interest_weights, pick_word, topic_for_category

LEVELS = {text: level for text, level, _ in WORDS}
TOPICS = {text: topic for text, _, topic in WORDS}
FLAT = interest_weights(next_visit_category=None, other_visit_categories=[], caught_categories=[])


def test_categories_map_to_topics():
    assert topic_for_category("Ramen restaurant") == "food"
    assert topic_for_category("Train station") == "transport"
    assert topic_for_category("Shinto shrine") == "sightseeing"
    assert topic_for_category("Something else") is None


def test_same_user_and_day_gets_the_same_word():
    a = pick_word(reading_level="most", weights=FLAT, owned=set(), seed="u1:2026-11-08")
    b = pick_word(reading_level="most", weights=FLAT, owned=set(), seed="u1:2026-11-08")
    assert a == b


def test_level_caps_the_words():
    for day in range(1, 29):
        pick = pick_word(reading_level="kana", weights=FLAT, owned=set(), seed=f"u1:2026-02-{day:02d}")
        assert pick is not None and LEVELS[pick.text] == 1


def test_owned_words_are_never_picked():
    owned = {text for text, level, _ in WORDS if level == 1 and text != "トイレ"}
    pick = pick_word(reading_level="kana", weights=FLAT, owned=owned, seed="u1:2026-11-08")
    assert pick is not None and pick.text == "トイレ"


def test_next_visit_steers_the_topic_and_reason():
    weights = interest_weights(
        next_visit_category="Ramen restaurant", other_visit_categories=[], caught_categories=[]
    )
    picks = [
        pick_word(
            reading_level="most",
            weights=weights,
            owned=set(),
            seed=f"u1:2026-03-{day:02d}",
            next_visit_name="麺屋たいき",
            next_visit_category="Ramen restaurant",
        )
        for day in range(1, 29)
    ]
    food = [p for p in picks if p and TOPICS[p.text] == "food"]
    assert len(food) > len(picks) / 2
    assert all(p.reason == WordReason(kind="visit", place_name="麺屋たいき") for p in food)



def test_other_reasons_are_data_too():
    caught = interest_weights(
        next_visit_category=None, other_visit_categories=[], caught_categories=["Ramen restaurant"] * 5
    )
    picks = [
        pick_word(reading_level="most", weights=caught, owned=set(), seed=f"u1:2026-04-{d:02d}")
        for d in range(1, 29)
    ]
    kinds = {p.reason.kind for p in picks if p}
    assert "topic" in kinds and kinds <= {"topic", "everyday"}
    assert all(p.reason.topic == p.topic for p in picks if p and p.reason.kind == "topic")


def test_nothing_left_to_learn():
    owned = {text for text, _, _ in WORDS}
    assert pick_word(reading_level="most", weights=FLAT, owned=owned, seed="x") is None
