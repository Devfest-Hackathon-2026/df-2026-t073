"""Builds data/jmdict.sqlite from the jmdict-simplified English release.

Run from backend/:  uv run python scripts/build_jmdict.py
Downloads the latest release (about 12 MB), keeps only what a Tango card
needs, and writes a small SQLite file the backend reads at catch time.

JMdict is the property of the Electronic Dictionary Research and Development
Group (EDRDG), used under its license (CC BY-SA 4.0):
https://www.edrdg.org/edrdg/licence.html
"""

import argparse
import io
import json
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

RELEASES_LATEST = "https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest"
RELEASES_LIST = "https://api.github.com/repos/scriptin/jmdict-simplified/releases?per_page=3"
OUT = Path(__file__).resolve().parent.parent / "data" / "jmdict.sqlite"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def _make_request(url: str, accept: str = "*/*") -> urllib.request.Request:
    return urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": accept,
        },
    )


def _fetch_bytes(url: str, timeout: int = 60, max_retries: int = 4, backoff: float = 3.0, accept: str = "*/*") -> bytes:
    req = _make_request(url, accept=accept)
    last_err: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            print(f"Fetching {url} (attempt {attempt}/{max_retries})...")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                content_len = resp.headers.get("Content-Length")
                total_expected = int(content_len) if content_len and content_len.isdigit() else None
                chunks: list[bytes] = []
                total_bytes = 0
                while True:
                    chunk = resp.read(1024 * 512)
                    if not chunk:
                        break
                    chunks.append(chunk)
                    total_bytes += len(chunk)
                    if total_expected:
                        mb = total_bytes / (1024 * 1024)
                        exp_mb = total_expected / (1024 * 1024)
                        pct = (total_bytes / total_expected) * 100
                        print(f"\r  Received {mb:.1f} MB / {exp_mb:.1f} MB ({pct:.0f}%)...", end="", flush=True)
                if total_expected:
                    print()
                else:
                    print(f"  Received {total_bytes / (1024 * 1024):.1f} MB.")
                return b"".join(chunks)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as e:
            last_err = e
            print(f"\n  Attempt {attempt} failed: {e}")
            if attempt < max_retries:
                sleep_sec = backoff * (2 ** (attempt - 1))
                print(f"  Retrying in {sleep_sec:.1f}s...")
                time.sleep(sleep_sec)
    raise RuntimeError(f"Failed to fetch {url} after {max_retries} attempts: {last_err}")


def _find_asset_url(release: dict) -> str | None:
    for asset in release.get("assets", []):
        name = asset.get("name", "")
        if name.startswith("jmdict-eng-") and not name.startswith("jmdict-eng-common") and name.endswith(".json.zip"):
            tag = release.get("tag_name", "unknown")
            print(f"Found asset in release {tag}: {name}")
            return asset.get("browser_download_url")
    return None


def _candidate_zip_urls() -> list[str]:
    candidates: list[str] = []
    # 1. Try latest release endpoint
    try:
        data = _fetch_bytes(RELEASES_LATEST, timeout=30, max_retries=3, accept="application/vnd.github.v3+json")
        release = json.loads(data)
        url = _find_asset_url(release)
        if url:
            candidates.append(url)
    except Exception as e:
        print(f"Could not load latest release metadata: {e}")

    # 2. Try releases list endpoint as fallback / additional candidates
    try:
        data = _fetch_bytes(RELEASES_LIST, timeout=30, max_retries=3, accept="application/vnd.github.v3+json")
        releases = json.loads(data)
        for release in releases:
            url = _find_asset_url(release)
            if url and url not in candidates:
                candidates.append(url)
    except Exception as e:
        print(f"Could not load releases list metadata: {e}")

    return candidates


def _load_words() -> list[dict]:
    urls = _candidate_zip_urls()
    if not urls:
        raise RuntimeError("No candidate zip URLs found from GitHub releases.")

    for url in urls:
        try:
            data = _fetch_bytes(url, timeout=120, max_retries=4)
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                name = next(n for n in zf.namelist() if n.endswith(".json"))
                print(f"Extracting and parsing {name}...")
                return json.loads(zf.read(name))["words"]
        except Exception as e:
            print(f"Failed to download/extract from {url}: {e}")
            continue

    raise RuntimeError("All candidate asset downloads failed.")


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


def main() -> int:
    parser = argparse.ArgumentParser(description="Build jmdict.sqlite from GitHub releases.")
    parser.add_argument("--allow-fail", action="store_true", help="Do not exit with non-zero status if download/build fails.")
    parser.add_argument("--force", action="store_true", help="Force rebuild even if database already exists.")
    args = parser.parse_args()

    OUT.parent.mkdir(parents=True, exist_ok=True)

    if not args.force and OUT.exists() and OUT.stat().st_size > 10_000_000:
        print(f"Database {OUT} already exists ({OUT.stat().st_size // 1_000_000} MB). Skipping build.")
        return 0

    try:
        words = _load_words()
        count = build(words, OUT)
        print(f"Wrote {count} entries to {OUT} ({OUT.stat().st_size // 1_000_000} MB)")
        return 0
    except Exception as e:
        print(f"Error building JMdict database: {e}", file=sys.stderr)
        if args.allow_fail:
            print(
                "WARNING: JMdict build failed, but --allow-fail was specified. "
                "Continuing without dictionary database. App will fall back to Gemini.",
                file=sys.stderr,
            )
            return 0
        return 1


if __name__ == "__main__":
    sys.exit(main())
