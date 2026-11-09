import json
import logging

import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.schemas.flashcard import (
    Distractors,
    FlashcardResponse,
    GeneratedFlashcardContent,
    JpOption,
    RelatedVocabItem,
)
from app.services.gemini import request_json

logger = logging.getLogger(__name__)


def _require_gemini_key() -> str:
    if not settings.GEMINI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GEMINI_API_KEY is not configured.",
        )
    return settings.GEMINI_API_KEY


async def generate_flashcard_content(
    *,
    http_client: httpx.AsyncClient,
    target_word: str,
    source_label: str | None = None,
    item_type: str = "object",
    language: str = "English",
) -> GeneratedFlashcardContent:
    """Generate structured Japanese vocabulary flashcard content via Gemini Structured Outputs."""
    _require_gemini_key()

    context_hint = (
        f" (detected from photo {item_type}: '{source_label}')"
        if source_label and source_label != target_word
        else ""
    )
    prompt = (
        f"Create a Japanese vocabulary study flashcard for '{target_word}'{context_hint}.\n"
        "Return:\n"
        "- kanji: The standard Japanese writing (kanji/kana, or katakana for loanwords).\n"
        "- reading: The full hiragana reading (furigana).\n"
        "- romaji: Standard Hepburn romaji.\n"
        f"- meaning: Clear, concise meaning, written in {language}.\n"
        "- part_of_speech: Grammatical category (e.g., Noun, Ichidan Verb, i-Adjective, Expression).\n"
        "- kind: 'word' for a single word, 'phrase' for a multi-word expression or sentence, "
        "'object' for a physical thing seen in a photo, 'menu_item' for food or drink on a menu.\n"
        "- use_cases: exactly 2 natural example sentences a learner might hear in daily life: "
        "one with register 'easy' (plain or simple polite) and one with register 'keigo' "
        "(how shop staff or official signs would say it). Each has the Japanese, its full "
        f"hiragana reading, and a translation in {language} (field name 'english')."
    )

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "kanji": {"type": "STRING"},
                    "reading": {"type": "STRING"},
                    "romaji": {"type": "STRING"},
                    "meaning": {"type": "STRING"},
                    "part_of_speech": {"type": "STRING"},
                    "kind": {
                        "type": "STRING",
                        "enum": ["word", "phrase", "object", "menu_item"],
                    },
                    "use_cases": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "japanese": {"type": "STRING"},
                                "reading": {"type": "STRING"},
                                "english": {"type": "STRING"},
                                "register": {"type": "STRING", "enum": ["easy", "keigo"]},
                            },
                            "required": ["japanese", "reading", "english", "register"],
                        },
                    },
                },
                "required": [
                    "kanji",
                    "reading",
                    "romaji",
                    "meaning",
                    "part_of_speech",
                    "kind",
                    "use_cases",
                ],
            },
        },
    }

    try:
        raw = await request_json(http=http_client, body=body)
        return GeneratedFlashcardContent.model_validate(raw)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to generate flashcard for word=%s", target_word)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invalid response from flashcard generator.",
        ) from exc


async def generate_related_vocabulary(
    *,
    http_client: httpx.AsyncClient,
    kanji: str,
    meaning: str,
    language: str = "English",
) -> list[RelatedVocabItem]:
    """Generate 4 contextually related Japanese vocabulary words to extend the lesson."""
    _require_gemini_key()

    prompt = (
        f"Given the Japanese vocabulary word '{kanji}' ({meaning}), suggest 4 closely related "
        "Japanese words that a learner would encounter in the same real-world situation or context. "
        f"For each word provide kanji, hiragana reading, meaning in {language}, and a brief relation_note in {language}."
    )

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "kanji": {"type": "STRING"},
                        "reading": {"type": "STRING"},
                        "meaning": {"type": "STRING"},
                        "relation_note": {"type": "STRING"},
                    },
                    "required": ["kanji", "reading", "meaning", "relation_note"],
                },
            },
        },
    }

    try:
        raw_items = await request_json(http=http_client, body=body)
        return [RelatedVocabItem.model_validate(item) for item in raw_items]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to generate related vocabulary for %s", kanji)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to generate related vocabulary.",
        ) from exc


async def generate_distractors(
    *,
    http_client: httpx.AsyncClient,
    cards: list[FlashcardResponse],
    language: str = "English",
) -> dict[str, Distractors]:
    """Plausible wrong answers for review questions, for many cards in one call.

    Returns {flashcard_id: Distractors}. Never raises: on any failure it returns
    what it has (possibly {}), and the caller fills gaps from other sources.
    """
    if not cards or not settings.GEMINI_API_KEY:
        return {}

    items = [
        {"flashcard_id": c.flashcard_id, "japanese": c.kanji, "reading": c.reading, "meaning": c.meaning}
        for c in cards
    ]
    prompt = (
        "You write wrong answer choices and accepted synonyms for a Japanese vocabulary quiz for learners living in Japan.\n"
        "For each item give:\n"
        f"- wrong_meanings: 3 short meanings in {language} that a learner could confuse with the "
        "correct meaning (same category, similar situation), never the correct meaning or a synonym.\n"
        "- look_alike_words: 3 different real Japanese words that look or sound similar or appear "
        "in the same places (shared kanji, similar katakana, same kind of sign), never the word "
        "itself. Give each with its hiragana reading and Hepburn romaji.\n"
        "- wrong_readings: 3 plausible wrong hiragana readings for the word (similar sound, alternate "
        "kanji reading, or long/short vowel difference), never the true reading itself.\n"
        f"- meaning_synonyms: 2 to 3 concise synonyms or alternate English/{language} translations "
        "that mean the exact same thing and should be accepted when the learner types the meaning.\n\n"
        f"Items:\n{json.dumps(items, ensure_ascii=False)}"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.4,
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "flashcard_id": {"type": "STRING"},
                        "wrong_meanings": {"type": "ARRAY", "items": {"type": "STRING"}},
                        "look_alike_words": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "text": {"type": "STRING"},
                                    "reading": {"type": "STRING"},
                                    "romaji": {"type": "STRING"},
                                },
                                "required": ["text", "reading", "romaji"],
                            },
                        },
                        "wrong_readings": {"type": "ARRAY", "items": {"type": "STRING"}},
                        "meaning_synonyms": {"type": "ARRAY", "items": {"type": "STRING"}},
                    },
                    "required": [
                        "flashcard_id",
                        "wrong_meanings",
                        "look_alike_words",
                        "wrong_readings",
                        "meaning_synonyms",
                    ],
                },
            },
        },
    }

    try:
        raw = await request_json(http=http_client, body=body)
    except Exception:
        logger.exception("Gemini distractor generation failed; using fallbacks")
        return {}

    wanted = {c.flashcard_id for c in cards}
    result: dict[str, Distractors] = {}
    for entry in raw:
        card_id = entry.get("flashcard_id")
        if card_id not in wanted:
            continue
        try:
            result[card_id] = Distractors(
                meanings=[m for m in entry.get("wrong_meanings", []) if isinstance(m, str)],
                words=[JpOption.model_validate(w) for w in entry.get("look_alike_words", [])],
                readings=[r for r in entry.get("wrong_readings", []) if isinstance(r, str)],
                synonyms=[s for s in entry.get("meaning_synonyms", []) if isinstance(s, str)],
            )
        except Exception:
            logger.warning("Skipping malformed distractors for %s", card_id)
    return result
