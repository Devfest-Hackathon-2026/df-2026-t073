from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from app.api.deps import CurrentUser
from app.services import dictionary

router = APIRouter(prefix="/dictionary", tags=["dictionary"])


class DictionaryEntry(BaseModel):
    text: str
    reading: str
    romaji: str
    meaning: str
    part_of_speech: str


@router.get("/lookup", response_model=DictionaryEntry)
async def lookup_word(
    current_user: CurrentUser,
    text: str = Query(..., min_length=1, max_length=40),
) -> DictionaryEntry:
    """JMdict reading and meaning for a word seen in the camera (local, no API cost).

    404 when it isn't a dictionary word (a fragment, a brand name, a sentence).
    """
    card = dictionary.lookup(text)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not in the dictionary.")
    return DictionaryEntry(
        text=card.text,
        reading=card.reading,
        romaji=card.romaji,
        meaning=card.meaning,
        part_of_speech=card.part_of_speech,
    )
