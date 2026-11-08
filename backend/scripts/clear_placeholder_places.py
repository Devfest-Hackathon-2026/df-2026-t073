"""Blanks placeholder place names ("Location off", "Near you", ...) on saved sightings.

Older app builds saved these labels as if they were places, so they showed up
as a Review collection and under "Where you saw it". New catches are cleaned on
the way in (tango_rules.clean_place_name); this fixes cards saved before that.

Run from backend/:
    uv run python scripts/clear_placeholder_places.py           # dry run
    uv run python scripts/clear_placeholder_places.py --apply   # write changes
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from google.cloud.firestore import Client  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.services.firestore import FLASHCARDS_SUBCOLLECTION, USERS_COLLECTION  # noqa: E402
from app.services.tango_rules import PLACEHOLDER_PLACE_NAMES  # noqa: E402


def main(apply: bool) -> None:
    db = Client(project=settings.FIREBASE_PROJECT_ID, database=settings.FIRESTORE_DATABASE_ID)
    changed_cards = 0
    changed_sightings = 0
    for user in db.collection(USERS_COLLECTION).list_documents():
        for snap in user.collection(FLASHCARDS_SUBCOLLECTION).stream():
            data = snap.to_dict() or {}
            sightings = data.get("sightings") or []
            hits = [s for s in sightings if (s.get("place_name") or "").strip() in PLACEHOLDER_PLACE_NAMES]
            if not hits:
                continue
            for s in hits:
                s["place_name"] = ""
            changed_cards += 1
            changed_sightings += len(hits)
            if apply:
                snap.reference.update({"sightings": sightings})
    mode = "Updated" if apply else "Would update"
    print(f"{mode} {changed_sightings} sightings on {changed_cards} cards.")
    if not apply and changed_cards:
        print("Run again with --apply to write the changes.")


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
