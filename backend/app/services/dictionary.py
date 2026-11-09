"""Instant Tango cards from JMdict (no network, no cost).

The database is built by scripts/build_jmdict.py. Without it, lookups return
None and catching falls back to Gemini.

JMdict is the property of the EDRDG, used under its license (CC BY-SA 4.0).
"""

import json
import logging
import sqlite3
import threading
import unicodedata
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "jmdict.sqlite"
MAX_GLOSSES = 3

# JMdict part-of-speech codes -> short labels like the Gemini cards used.
_POS = [
    ("exp", "Expression"),
    ("v1", "Ichidan verb"),
    ("v5", "Godan verb"),
    ("vs", "Suru verb"),
    ("vk", "Kuru verb"),
    ("adj-i", "i-Adjective"),
    ("adj-na", "na-Adjective"),
    ("adj-no", "Noun (takes の)"),
    ("adv", "Adverb"),
    ("int", "Interjection"),
    ("ctr", "Counter"),
    ("pn", "Pronoun"),
    ("prt", "Particle"),
    ("conj", "Conjunction"),
    ("suf", "Suffix"),
    ("pref", "Prefix"),
    ("n", "Noun"),
]


@dataclass(frozen=True)
class DictCard:
    text: str
    reading: str
    romaji: str
    meaning: str
    part_of_speech: str
    is_phrase: bool


def normalize(text: str) -> str:
    """Width-folds (ｶﾀｶﾅ -> カタカナ, ＡＢ -> AB) and drops spaces."""
    return "".join(unicodedata.normalize("NFKC", text).split())


def to_hiragana(text: str) -> str:
    """Katakana -> hiragana; the long-vowel mark and everything else stay."""
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in text)


_ROMAJI = {
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
    "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
    "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
    "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
    "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
    "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
    "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
    "や": "ya", "ゆ": "yu", "よ": "yo",
    "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
    "わ": "wa", "ゐ": "i", "ゑ": "e", "を": "o", "ん": "n", "ゔ": "vu",
    "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o",
}
_SMALL_Y = {"ゃ": "a", "ゅ": "u", "ょ": "o"}
_MACRON = {"a": "ā", "i": "ī", "u": "ū", "e": "ē", "o": "ō"}


def to_romaji(kana: str) -> str:
    """Hepburn romaji for a kana reading (hiragana or katakana)."""
    text = to_hiragana(kana)
    out: list[str] = []
    double_next = False
    i = 0
    while i < len(text):
        c = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if c == "っ":
            double_next = True
            i += 1
            continue
        if c == "ー":
            if out and out[-1] and out[-1][-1] in _MACRON:
                out[-1] = out[-1][:-1] + _MACRON[out[-1][-1]]
            i += 1
            continue
        syllable = _ROMAJI.get(c)
        if syllable is None:
            out.append(c)
            i += 1
            continue
        if nxt in _SMALL_Y and syllable.endswith("i") and len(syllable) > 1:
            # きゃ -> kya, しゃ -> sha, ちゃ -> cha, じゃ -> ja
            base = syllable[:-1]
            syllable = (base if base in ("sh", "ch", "j") else base + "y") + _SMALL_Y[nxt]
            i += 1
        elif c == "ん" and (nxt in "あいうえおやゆよ" and nxt):
            syllable = "n'"
        if double_next:
            syllable = ("t" if syllable.startswith("ch") else syllable[0]) + syllable
            double_next = False
        out.append(syllable)
        i += 1
    return "".join(out)


def pos_label(codes: list[str]) -> str:
    for code in codes:
        for prefix, label in _POS:
            if code == prefix or code.startswith(prefix):
                return label
    return "Word"


def card_from_entry(text: str, entry: dict) -> DictCard:
    """Builds a card for `text` as written, from one JMdict entry."""
    kanji_forms = [k["text"] for k in entry.get("kanji", [])]
    kana_forms = entry.get("kana", [])
    if text in kanji_forms:
        readings = [k["text"] for k in kana_forms if "*" in k["applies"] or text in k["applies"]]
        reading = readings[0] if readings else (kana_forms[0]["text"] if kana_forms else text)
        senses = [s for s in entry.get("sense", []) if "*" in s["applies_kanji"] or text in s["applies_kanji"]]
    else:
        reading = text
        senses = entry.get("sense", [])
    senses = [s for s in senses if s["gloss"]] or [s for s in entry.get("sense", []) if s["gloss"]]
    first = senses[0] if senses else {"gloss": [], "pos": []}
    meaning = "; ".join(first["gloss"][:MAX_GLOSSES])
    pos = first["pos"] or next((s["pos"] for s in senses if s["pos"]), [])
    return DictCard(
        text=text,
        reading=to_hiragana(reading),
        romaji=to_romaji(reading),
        meaning=meaning,
        part_of_speech=pos_label(pos),
        is_phrase="exp" in pos,
    )


_local = threading.local()


def _connection() -> sqlite3.Connection | None:
    conn = getattr(_local, "conn", None)
    if conn is None and DB_PATH.exists():
        conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, check_same_thread=False)
        _local.conn = conn
    return conn


def lookup(text: str) -> DictCard | None:
    """The best JMdict card for `text`, or None (not a dictionary word, or no DB)."""
    word = normalize(text)
    if not word:
        return None
    conn = _connection()
    if conn is None:
        logger.info("JMdict database missing (%s); using Gemini.", DB_PATH)
        return None
    row = conn.execute(
        "SELECT e.data FROM forms f JOIN entries e ON e.id = f.entry_id "
        "WHERE f.form = ? ORDER BY f.common DESC, f.rank LIMIT 1",
        (word,),
    ).fetchone()
    if row is None:
        return None
    card = card_from_entry(word, json.loads(row[0]))
    return card if card.meaning else None
