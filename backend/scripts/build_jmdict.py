"""Builds data/jmdict.sqlite from the jmdict-simplified English release.

Run from backend/:  uv run python scripts/build_jmdict.py
Downloads the latest release (about 12 MB), keeps only what a Tango card
needs, and writes a small SQLite file the backend reads at catch time.

JMdict is the property of the Electronic Dictionary Research and Development
Group (EDRDG), used under its licence (CC BY-SA 4.0):
https://www.edrdg.org/edrdg/licence.html
"""

import io
import json
import sqlite3
import sys
import urllib.request
import zipfile
from pathlib import Path

RELEASES = "https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest"
OUT = Path(__file__).resolve().parent.parent / "data" / "jmdict.sqlite"


def _latest_zip_url() -> str:
    with urllib.request.urlopen(RELEASES, timeout=30) as resp:
        release = json.load(resp)
    for asset in release["assets"]:
        name = asset["name"]
        if name.startswith("jmdict-eng-") and not name.startswith("jmdict-eng-common") and name.endswith(".json.zip"):
            print(f"Release {release['tag_name']}: {name}")
            return asset["browser_download_url"]
    raise SystemExit("No jmdict-eng .json.zip asset in the latest release.")


def _load_words(url: str) -> list[dict]:
    with urllib.request.urlopen(url, timeout=120) as resp:
        data = resp.read()
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        name = next(n for n in zf.namelist() if n.endswith(".json"))
        return json.loads(zf.read(name))["words"]


def build(words: list[dict], out: Path) -> int:
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.execute("CREATE TABLE entries (id INTEGER PRIMARY KEY, data TEXT NOT NULL)")
    db.execute("CREATE TABLE forms (form TEXT NOT NULL, entry_id INTEGER NOT NULL, common INTEGER NOT NULL, rank INTEGER NOT NULL)")
    for rank, word in enumerate(words):
        entry_id = int(word["id"])
        data = {
            "kanji": [{"text": k["text"], "common": k.get("common", False)} for k in word.get("kanji", [])],
            "kana": [
                {"text": k["text"], "common": k.get("common", False), "applies": k.get("appliesToKanji", ["*"])}
                for k in word.get("kana", [])
            ],
            "sense": [
                {
                    "pos": s.get("partOfSpeech", []),
                    "applies_kanji": s.get("appliesToKanji", ["*"]),
                    "gloss": [g["text"] for g in s.get("gloss", []) if g.get("lang", "eng") == "eng"],
                }
                for s in word.get("sense", [])
            ],
        }
        db.execute("INSERT INTO entries VALUES (?, ?)", (entry_id, json.dumps(data, ensure_ascii=False)))
        for form in word.get("kanji", []) + word.get("kana", []):
            db.execute(
                "INSERT INTO forms VALUES (?, ?, ?, ?)",
                (form["text"], entry_id, 1 if form.get("common") else 0, rank),
            )
    db.execute("CREATE INDEX forms_by_text ON forms(form)")
    db.commit()
    db.execute("VACUUM")
    db.close()
    tmp.replace(out)
    return len(words)


def main() -> None:
    count = build(_load_words(_latest_zip_url()), OUT)
    print(f"Wrote {count} entries to {OUT} ({OUT.stat().st_size // 1_000_000} MB)")


if __name__ == "__main__":
    sys.exit(main())
