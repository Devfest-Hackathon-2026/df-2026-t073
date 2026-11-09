from datetime import timedelta

from app.services.review_rules.selection import (
    PLACE_CUE_COLLECTION,
    SESSION_SIZE,
    next_due_at,
    order_session_cards,
    pick_session_cards,
)
from tests.review_rules.factories import NOW, card


class TestNextDue:
    def test_soonest_upcoming_card(self) -> None:
        cards = [
            card("later", due_in=timedelta(days=2)),
            card("soon", due_in=timedelta(hours=3)),
        ]
        assert next_due_at(cards, NOW) == NOW + timedelta(hours=3)

    def test_none_while_something_is_due(self) -> None:
        cards = [card("due"), card("later", due_in=timedelta(days=2))]
        assert next_due_at(cards, NOW) is None

    def test_none_without_cards(self) -> None:
        assert next_due_at([], NOW) is None


class TestPicking:
    def test_only_due_cards_without_collection(self) -> None:
        cards = [card("a"), card("b", due_in=timedelta(days=2))]
        assert [c.flashcard_id for c in pick_session_cards(cards, NOW)] == ["a"]

    def test_weakest_first(self) -> None:
        cards = [card("strong", strength=3), card("weak", strength=0)]
        assert [c.flashcard_id for c in pick_session_cards(cards, NOW)] == [
            "weak",
            "strong",
        ]

    def test_collection_fills_with_not_yet_due(self) -> None:
        cards = [
            card("due"),
            card("later", due_in=timedelta(days=2)),
            card("elsewhere", places=("Nakano",)),
        ]
        picked = pick_session_cards(cards, NOW, collection="place:Koenji")
        assert [c.flashcard_id for c in picked] == ["due", "later"]

    def test_place_cue_needs_a_named_place(self) -> None:
        cards = [card("named"), card("unnamed", places=())]
        picked = pick_session_cards(cards, NOW, collection=PLACE_CUE_COLLECTION)
        assert [c.flashcard_id for c in picked] == ["named"]

    def test_area_collection_uses_place_areas(self) -> None:
        koenji = card("k", places=("Koenji Station",))
        koenji.sightings[0].place_id = "p1"
        nakano = card("n", places=("Nakano Station",))
        picked = pick_session_cards(
            [koenji, nakano],
            NOW,
            collection="area:koenji",
            area_by_place={"p1": "Koenji"},
        )
        assert [c.flashcard_id for c in picked] == ["k"]

    def test_session_size_cap(self) -> None:
        cards = [card(str(i)) for i in range(15)]
        assert len(pick_session_cards(cards, NOW)) == SESSION_SIZE

    def test_order_session_cards_easiest_to_hardest(self) -> None:
        c_fill = card("fill", stage="fill", strength=4)
        c_mcq = card("mcq", stage="mcq", strength=3)
        c_mcq_photo = card("mcq_photo", stage="mcq_photo", strength=2, image=True)
        c_flash = card("flash", stage="flashcard", strength=0)
        ordered = order_session_cards([c_fill, c_mcq, c_mcq_photo, c_flash])
        assert [c.flashcard_id for c in ordered] == [
            "flash",
            "mcq_photo",
            "mcq",
            "fill",
        ]
