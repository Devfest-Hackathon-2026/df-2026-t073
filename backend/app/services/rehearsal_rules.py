"""Pure rules for briefings and rehearsals. No I/O; tested offline."""

import hashlib
import random
from datetime import datetime
from typing import Any

from app.schemas.flashcard import FlashcardResponse, SavedSentence
from app.schemas.place import JpName
from app.schemas.prepare import BriefingContent, BriefingTango
from app.schemas.rehearsal import (
    RehearsalScript,
    RehearsalTurn,
    ReplyChoice,
    ResultLine,
    SentenceTango,
    Speed,
    Suggestion,
    TurnResult,
)

CHOICES_PER_TURN = 3
MAX_STEPS = 3
MAX_TANGO = 4
TTS_RATE: dict[str, float] = {"slower": 0.8, "natural": 1.0}
TTS_VOICE = "ja-JP-Neural2-B"

SUPPORTED_LANGUAGES: frozenset[str] = frozenset(
    {"english", "japanese", "spanish", "french", "german", "korean", "chinese", "italian", "portuguese"}
)


def normalize_language(language: str) -> str:
    """Validate and normalize a user-supplied language string.

    Returns the canonical capitalized name (e.g. 'English'). Raises ValueError if unsupported.
    """
    clean = str(language or "").strip().lower()
    if clean not in SUPPORTED_LANGUAGES:
        raise ValueError(
            f"Unsupported language '{language}'. Supported: {', '.join(sorted(SUPPORTED_LANGUAGES))}."
        )
    return clean.capitalize()


def _jp(raw: dict[str, Any] | None) -> JpName:
    raw = raw or {}
    return JpName(
        text=str(raw.get("text", "")).strip(),
        reading=(str(raw.get("reading", "")).strip() or None),
        romaji=(str(raw.get("romaji", "")).strip() or None),
        meaning=(str(raw.get("meaning", "")).strip() or None),
    )


def parse_briefing(raw: dict[str, Any]) -> BriefingContent:
    """Gemini briefing JSON -> BriefingContent, trimmed to the sizes the screen expects."""
    steps = [str(s).strip() for s in raw.get("steps", []) if str(s).strip()][:MAX_STEPS]
    tango = []
    for t in raw.get("tango", []):
        jp = _jp(t)
        if jp.text:
            tango.append(
                BriefingTango(text=jp.text, reading=jp.reading or "", romaji=jp.romaji or "", meaning=jp.meaning or "")
            )
    return BriefingContent(steps=steps, tango=tango[:MAX_TANGO], source=str(raw.get("source", "")).strip())


def parse_script(raw: dict[str, Any], seed: str) -> RehearsalScript:
    """Gemini script JSON -> RehearsalScript.

    Keeps staff/user alternation, gives every user turn exactly 3 choices with at
    least one natural reply, and shuffles choices (stable per `seed`) so the
    natural one isn't always first.
    """
    turns: list[RehearsalTurn] = []
    for i, ex in enumerate(raw.get("exchanges", [])):
        staff = _jp(ex.get("staff"))
        model = _jp(ex.get("model_reply"))
        if not staff.text or not model.text:
            continue
        choices: list[ReplyChoice] = []
        for c in ex.get("choices", [])[:CHOICES_PER_TURN]:
            jp = _jp(c)
            if not jp.text:
                continue
            ok = bool(c.get("ok"))
            suggestion = None if ok else Suggestion(jp=model, why=str(c.get("why_suggestion", "")).strip() or "This is what staff usually hear.")
            choices.append(
                ReplyChoice(
                    jp=jp,
                    en=jp.meaning or "",
                    ok=ok,
                    label=str(c.get("label", "")).strip() or ("Natural" if ok else "Not quite"),
                    note=str(c.get("note", "")).strip(),
                    suggestion=suggestion,
                )
            )
        if not any(c.ok for c in choices):
            choices.insert(0, ReplyChoice(jp=model, en=model.meaning or "", ok=True, label="Natural and polite", note="This is what staff expect to hear."))
        choices = choices[:CHOICES_PER_TURN]
        random.Random(f"{seed}:{i}").shuffle(choices)
        turns.append(RehearsalTurn(id=f"s{i + 1}", speaker="staff", jp=staff, en=staff.meaning or ""))
        turns.append(
            RehearsalTurn(
                id=f"u{i + 1}",
                speaker="user",
                jp=model,
                en=model.meaning or "",
                hint=str(ex.get("hint", "")).strip() or None,
                choices=choices,
            )
        )
    if not turns:
        raise ValueError("Script has no usable exchanges.")
    return RehearsalScript(staff_voice=str(raw.get("staff_voice", "")).strip() or "Staff", turns=turns)


def staff_before(turns: list[RehearsalTurn], turn_id: str) -> JpName:
    """The staff line the user was answering."""
    for i, t in enumerate(turns):
        if t.id == turn_id:
            for prev in reversed(turns[:i]):
                if prev.speaker == "staff":
                    return prev.jp
    return JpName(text="")


def result_from_choice(turns: list[RehearsalTurn], turn: RehearsalTurn, index: int) -> TurnResult:
    choice = turn.choices[index]
    return TurnResult(
        turn_id=turn.id,
        staff=staff_before(turns, turn.id),
        said=choice.jp,
        spoken=False,
        ok=choice.ok,
        label=choice.label,
        note=choice.note,
        suggestion=choice.suggestion,
    )


def result_from_audio(turns: list[RehearsalTurn], turn: RehearsalTurn, raw: dict[str, Any]) -> TurnResult:
    """Gemini's rating of a spoken reply -> TurnResult. Unclear audio counts as 'try again'."""
    said = _jp(raw.get("transcript"))
    heard = bool(said.text) and bool(raw.get("understood", True))
    ok = heard and bool(raw.get("ok"))
    suggestion = None
    if not ok:
        why = str(raw.get("why_suggestion", "")).strip() or "Try saying it like this."
        suggestion = Suggestion(jp=turn.jp, why=why)
    return TurnResult(
        turn_id=turn.id,
        staff=staff_before(turns, turn.id),
        said=said if heard else JpName(text="（聞き取れませんでした）", meaning="(couldn't hear that)"),
        spoken=True,
        ok=ok,
        label=str(raw.get("label", "")).strip() or ("Natural" if ok else "Not quite"),
        note=str(raw.get("note", "")).strip() if heard else "The recording was unclear. Try again closer to the mic.",
        suggestion=suggestion,
    )


def tts_cache_key(text: str, speed: Speed) -> str:
    """Same text, voice and speed -> same stored audio file."""
    digest = hashlib.sha256(f"{TTS_VOICE}:{TTS_RATE[speed]}:{text}".encode("utf-8")).hexdigest()
    return f"tts/{digest[:32]}.mp3"


# ---- Saving rehearsal sentences to Tango ----


def tango_in(text: str, cards: list[FlashcardResponse]) -> list[SentenceTango]:
    """The user's Tango whose word appears in a sentence."""
    return [
        SentenceTango(flashcard_id=c.flashcard_id, text=c.kanji)
        for c in cards
        if c.kanji.strip() and c.kanji.strip() in text
    ]


def result_line(result: TurnResult, cards: list[FlashcardResponse]) -> ResultLine:
    """A result line with the Tango each version of it could be saved to."""
    return ResultLine(
        **result.model_dump(),
        said_tango=tango_in(result.said.text, cards),
        suggestion_tango=tango_in(result.suggestion.jp.text, cards) if result.suggestion else [],
    )


def sentence_to_save(
    result: TurnResult,
    *,
    use_suggestion: bool,
    rehearsal_id: str,
    place_name: str,
    sentence_id: str,
    now: datetime,
) -> SavedSentence | None:
    """The sentence to save: what was said, or the suggestion (None if there isn't one)."""
    if use_suggestion and result.suggestion is None:
        return None
    jp = result.suggestion.jp if use_suggestion and result.suggestion else result.said
    return SavedSentence(
        sentence_id=sentence_id,
        text=jp.text,
        reading=jp.reading,
        romaji=jp.romaji,
        meaning=jp.meaning,
        kind="suggested" if use_suggestion else "yours",
        place_name=place_name,
        rehearsal_id=rehearsal_id,
        turn_id=result.turn_id,
        saved_at=now,
    )


def already_saved(card: FlashcardResponse, sentence: SavedSentence) -> bool:
    """The same line (rehearsal, turn and version) is already on this Tango."""
    return any(
        (s.rehearsal_id, s.turn_id, s.kind) == (sentence.rehearsal_id, sentence.turn_id, sentence.kind)
        for s in card.saved_sentences
    )
