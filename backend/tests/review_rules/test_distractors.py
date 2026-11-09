from app.schemas.flashcard import (
    Distractors,
    JpOption,
)
from app.services.review_rules.distractors import complete_distractors
from tests.review_rules.factories import card


class TestDistractors:
    def test_gemini_first_then_other_cards_then_fallback(self) -> None:
        c = card("a")
        other = card("b", kanji="替え玉", reading="かえだま", meaning="noodle refill")
        found = Distractors(
            meanings=["receipt"],
            words=[JpOption(text="会計", reading="かいけい", romaji="kaikei")],
            readings=["しょくけん"],
        )
        d = complete_distractors(c, found, [c, other])
        assert d.meanings[:2] == ["receipt", "noodle refill"]
        assert [w.text for w in d.words[:2]] == ["会計", "替え玉"]
        assert d.readings[:2] == ["しょくけん", "かえだま"]
        assert len(d.meanings) == 3 and len(d.words) == 3 and len(d.readings) == 3

    def test_prefers_same_capture_format_cards(self) -> None:
        obj = card(
            "obj1",
            kanji="券売機",
            reading="けんばいき",
            meaning="ticket machine",
            capture_format="object",
        )
        text_other = card(
            "txt", kanji="出口", reading="でぐち", meaning="exit", capture_format="text"
        )
        obj_other = card(
            "obj2",
            kanji="傘立て",
            reading="かさたて",
            meaning="umbrella stand",
            capture_format="object",
        )
        d = complete_distractors(obj, None, [obj, text_other, obj_other])
        assert d.words[0].text == "傘立て"

    def test_never_includes_the_right_answer_or_synonyms(self) -> None:
        c = card("a", meaning="meal ticket; voucher", synonyms=["food coupon"])
        found = Distractors(
            meanings=["Meal Ticket", "voucher", "food coupon", "exit"],
            words=[JpOption(text="食券", reading="しょっけん")],
            readings=["しょっけん", "しょくけん"],
        )
        d = complete_distractors(c, found, [])
        lowered = [m.lower() for m in d.meanings]
        assert "meal ticket" not in lowered
        assert "voucher" not in lowered
        assert "food coupon" not in lowered
        assert "食券" not in [w.text for w in d.words]
        assert "しょっけん" not in d.readings
