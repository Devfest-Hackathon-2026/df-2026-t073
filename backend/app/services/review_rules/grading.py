"""Answer normalization, accepted answers, grading and ratings."""

import re
import unicodedata
from collections.abc import Callable

from app.schemas.flashcard import (
    FlashcardResponse,
    QuestionType,
)
from app.schemas.review_types import Rating
from app.services.review_rules.question_types import (
    QUESTIONS,
    RATING_WHEN_CORRECT,
    AnswerKind,
    family_of,
)

_KANJI_OR_LATIN_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff々a-zA-Z]")


_LATIN_RE = re.compile(r"[a-zA-Z]")


_PAREN_RE = re.compile(r"\s*\([^)]*\)")


_LEADING_ARTICLE_RE = re.compile(r"^(?:to|a|an|the)\s+", re.IGNORECASE)


# Separators between whole glosses: ";", a comma not inside a number ("exit,way out"
# but not "1,000 yen bill"), and a spaced slash ("meal ticket / food voucher").
_GLOSS_SEPARATOR_RE = re.compile(r";|,(?!\d)|\s+/\s+")


_LETTERS_ONLY_RE = re.compile(r"[^\W\d_]+")


_ANY_SEPARATOR_RE = re.compile(r"[,;/]")


def rating_for_answer(
    question_type: QuestionType | None,
    correct: bool | None,
    client_rating: Rating | None = None,
) -> Rating:
    """Derive the review rating from the question type and whether the answer was right."""
    family = family_of(question_type)
    fixed = RATING_WHEN_CORRECT[family] if family else None
    if fixed is not None:
        if correct is None:
            return fixed if client_rating in ("good", "easy") else "again"
        return fixed if correct else "again"
    if client_rating is not None:
        return client_rating
    return "good" if correct else "again"


def grade_answer(
    card: FlashcardResponse,
    question_type: QuestionType | None,
    correct: bool | None,
    rating: Rating | None,
    answer_text: str | None,
) -> bool:
    """Whether a submitted review counts as correct.

    The server always grades fill-in-the-blank itself, whatever the client says.
    Otherwise it trusts the client's correct flag, then its rating.
    Missing information is never correct.
    """
    if question_type and family_of(question_type) == "fill":
        return answer_text is not None and check_card_answer(
            card, question_type, answer_text
        )
    if correct is not None:
        return correct
    return rating is not None and rating != "again"


def katakana_to_hiragana(text: str) -> str:
    """Fold full-width katakana (ァ..ヶ) to hiragana (ぁ..ゖ). Keeps 'ー' as is."""
    chars: list[str] = []
    for ch in text:
        code = ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            chars.append(chr(code - 0x60))
        else:
            chars.append(ch)
    return "".join(chars)


def normalize_answer(text: str) -> str:
    """NFKC, trim, lowercase, and convert katakana to hiragana."""
    folded = unicodedata.normalize("NFKC", text).strip().lower()
    return katakana_to_hiragana(folded)


def is_kana_only(card: FlashcardResponse) -> bool:
    """True when the word has no kanji to test reading on (kanji == reading in kana)."""
    if not card.reading.strip():
        return True
    return normalize_answer(card.kanji) == normalize_answer(card.reading)


def has_non_kana_for_reading(text: str) -> bool:
    """True when a reading answer contains kanji or Latin letters (shows a hint, not wrong)."""
    folded = unicodedata.normalize("NFKC", text).strip()
    return bool(folded and _KANJI_OR_LATIN_RE.search(folded))


def normalize_meaning(text: str) -> str:
    """Case-insensitive normalized meaning with optional leading 'to '/'a '/'an '/'the ' stripped."""
    collapsed = re.sub(r"\s+", " ", normalize_answer(text)).strip()
    stripped = _LEADING_ARTICLE_RE.sub("", collapsed).strip()
    return stripped or collapsed


def split_glosses(item: str) -> list[str]:
    """Split a meaning into the glosses a learner may type on their own.

    "toilet/restroom" gives both words, since single words around a slash are
    alternatives. "on/off switch" and "24/7" stay whole: there the slash is part of one gloss.
    """
    out: list[str] = []
    for part in _GLOSS_SEPARATOR_RE.split(item):
        part = part.strip()
        words = [w.strip() for w in part.split("/")]
        if len(words) > 1 and all(_LETTERS_ONLY_RE.fullmatch(w) for w in words):
            out.extend(words)
        elif part:
            out.append(part)
    return out


def _with_variants(items: list[str], split: Callable[[str], list[str]]) -> list[str]:
    """Each item, its parts, and each of those without parenthesized notes."""
    out: list[str] = []
    for item in items:
        for piece in [item, *split(item)]:
            out.append(piece.strip())
            out.append(_PAREN_RE.sub("", piece).strip())
    return [c for c in out if c]


def accepted_meanings(card: FlashcardResponse) -> list[str]:
    """All accepted meaning strings: full meaning, individual glosses, and synonyms."""
    return merge_synonyms(
        _with_variants([card.meaning, *card.meaning_synonyms], split_glosses)
    )


def _excluded_meaning_keys(card: FlashcardResponse, synonyms: list[str]) -> set[str]:
    """Normalized meanings a wrong option must never match. Splits on every separator,
    so it is wider than what is accepted as a typed answer."""
    items = [card.meaning, *synonyms]
    loose = _with_variants(items, lambda t: _ANY_SEPARATOR_RE.split(t))
    strict = _with_variants(items, split_glosses)
    return {k for k in (normalize_meaning(m) for m in [*loose, *strict]) if k}


def accepted_answers_for(
    card: FlashcardResponse, question_type: QuestionType
) -> list[str]:
    """Accepted strings for a fill-in-the-blank question."""
    if question_type == "fill_text_reading":
        reading = card.reading.strip() or card.kanji.strip()
        return [reading] if reading else []
    if question_type in ("fill_text_reverse", "fill_object_name"):
        out: list[str] = []
        for val in (card.kanji.strip(), card.reading.strip()):
            if val and val not in out:
                out.append(val)
        return out
    if question_type == "fill_text_translate":
        return accepted_meanings(card)
    return []


def check_fill_answer(
    answer: str,
    accepted_answers: list[str],
    answer_kind: AnswerKind,
) -> bool:
    """Grade a typed answer against accepted_answers."""
    if not answer or not answer.strip():
        return False
    if answer_kind == "meaning":
        given = normalize_meaning(answer)
        return bool(given) and any(
            given == normalize_meaning(a) for a in accepted_answers
        )

    # Japanese answer (reading, reverse, or object name): romaji is never accepted.
    folded = unicodedata.normalize("NFKC", answer).strip()
    if _LATIN_RE.search(folded):
        return False
    given = normalize_answer(folded)
    return bool(given) and any(given == normalize_answer(a) for a in accepted_answers)


def check_card_answer(
    card: FlashcardResponse,
    question_type: QuestionType,
    answer: str,
) -> bool:
    """Grade a typed answer for a specific card and question type."""
    return check_typed_answer(
        question_type, answer, accepted_answers_for(card, question_type)
    )


def check_typed_answer(
    question_type: QuestionType, answer: str, accepted_answers: list[str]
) -> bool:
    """Grade a typed answer against a question's accepted answers.

    A reading answer with kanji or romaji is wrong (the app asks for kana first).
    """
    spec = QUESTIONS[question_type]
    if spec.asks_reading and has_non_kana_for_reading(answer):
        return False
    return check_fill_answer(answer, accepted_answers, spec.answer_kind or "kana")


def merge_synonyms(*lists: list[str]) -> list[str]:
    """Combine synonym lists in order, dropping duplicates (by normalized meaning)."""
    return _unique_meanings([s for items in lists for s in items], exclude_norm=set())


def _unique_meanings(items: list[str], exclude_norm: set[str]) -> list[str]:
    seen = set(exclude_norm)
    out: list[str] = []
    for item in items:
        key = normalize_meaning(item)
        if key and key not in seen:
            seen.add(key)
            out.append(item.strip())
    return out
