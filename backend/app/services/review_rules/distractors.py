"""Wrong answer choices: Gemini's, the user's other cards, then built-in fallbacks."""

from app.schemas.flashcard import (
    Distractors,
    FlashcardResponse,
    JpOption,
)
from app.services.review_rules.cards import capture_format, uses_object_questions
from app.services.review_rules.grading import (
    _excluded_meaning_keys,
    _unique_meanings,
    is_kana_only,
    merge_synonyms,
    normalize_answer,
)

OPTIONS_PER_QUESTION = 4


WRONG_PER_QUESTION = OPTIONS_PER_QUESTION - 1


# Last resort when Gemini and the user's other cards can't supply enough wrong answers.
FALLBACK_MEANINGS = [
    "exit",
    "entrance",
    "receipt",
    "closed",
    "open",
    "discount",
    "station",
]


FALLBACK_WORDS = [
    JpOption(text="出口", reading="でぐち", romaji="deguchi"),
    JpOption(text="入口", reading="いりぐち", romaji="iriguchi"),
    JpOption(text="営業中", reading="えいぎょうちゅう", romaji="eigyōchū"),
    JpOption(text="禁煙", reading="きんえん", romaji="kin'en"),
    JpOption(text="改札", reading="かいさつ", romaji="kaisatsu"),
    JpOption(text="会計", reading="かいけい", romaji="kaikei"),
]


FALLBACK_OBJECT_WORDS = [
    JpOption(text="自動販売機", reading="じどうはんばいき", romaji="jidō hanbaiki"),
    JpOption(text="改札機", reading="かいさつき", romaji="kaisatsuki"),
    JpOption(text="ゴミ箱", reading="ごみばこ", romaji="gomibako"),
    JpOption(text="傘立て", reading="かさたて", romaji="kasatate"),
    JpOption(text="券売機", reading="けんばいき", romaji="kenbaiki"),
    JpOption(text="おしぼり", reading="おしぼり", romaji="oshibori"),
]


FALLBACK_READINGS = [
    "でぐち",
    "いりぐち",
    "えいぎょうちゅう",
    "きんえん",
    "かいさつ",
    "かいけい",
]


def needs_distractors(card: FlashcardResponse) -> bool:
    """True when the card has no cached wrong answers, or lacks the readings its
    questions need (cached before reading questions existed)."""
    if card.distractors is None:
        return True
    asks_reading = not uses_object_questions(card) and not is_kana_only(card)
    return asks_reading and not card.distractors.readings


def complete_distractors(
    card: FlashcardResponse,
    found: Distractors | None,
    others: list[FlashcardResponse],
) -> Distractors:
    """Make sure a card has enough wrong answers: Gemini's first, then the
    user's other cards (same capture_format preferred), then a built-in list."""
    found = found or Distractors()
    fmt = capture_format(card)

    other_cards = [o for o in others if o.flashcard_id != card.flashcard_id]
    other_cards.sort(key=lambda o: 0 if capture_format(o) == fmt else 1)

    synonyms = merge_synonyms(card.meaning_synonyms, found.synonyms)
    excluded_meanings = _excluded_meaning_keys(card, synonyms)

    meanings = _unique_meanings(
        [
            *found.meanings,
            *(o.meaning for o in other_cards),
            *FALLBACK_MEANINGS,
        ],
        exclude_norm=excluded_meanings,
    )[:WRONG_PER_QUESTION]

    fallback_words = (
        [*FALLBACK_OBJECT_WORDS, *FALLBACK_WORDS]
        if fmt == "object"
        else [*FALLBACK_WORDS, *FALLBACK_OBJECT_WORDS]
    )
    word_pool = [
        *found.words,
        *(
            JpOption(text=o.kanji, reading=o.reading, romaji=o.romaji)
            for o in other_cards
        ),
        *fallback_words,
    ]
    seen_words = {card.kanji.strip()}
    seen_word_readings = (
        {normalize_answer(card.reading)} if card.reading.strip() else set()
    )
    words: list[JpOption] = []
    for word in word_pool:
        text_key = word.text.strip()
        reading_key = normalize_answer(word.reading) if word.reading.strip() else ""
        if (
            text_key
            and text_key not in seen_words
            and (not reading_key or reading_key not in seen_word_readings)
        ):
            seen_words.add(text_key)
            if reading_key:
                seen_word_readings.add(reading_key)
            words.append(word)
        if len(words) == WRONG_PER_QUESTION:
            break

    reading_pool = [
        *found.readings,
        *(o.reading for o in other_cards if o.reading.strip()),
        *FALLBACK_READINGS,
    ]
    seen_readings = {
        normalize_answer(card.reading),
        normalize_answer(card.kanji),
    }
    readings: list[str] = []
    for reading in reading_pool:
        norm_r = normalize_answer(reading)
        if reading.strip() and norm_r and norm_r not in seen_readings:
            seen_readings.add(norm_r)
            readings.append(reading.strip())
        if len(readings) == WRONG_PER_QUESTION:
            break

    return Distractors(
        meanings=meanings,
        words=words,
        readings=readings,
        synonyms=synonyms,
    )
