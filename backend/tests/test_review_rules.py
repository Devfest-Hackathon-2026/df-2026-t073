from datetime import datetime, timedelta, timezone

from app.schemas.capture import Vertex
from app.schemas.flashcard import (
    Distractors,
    FlashcardResponse,
    JpOption,
    ReviewStats,
    Sighting,
    UseCaseExample,
)
from app.schemas.review import FillGapExercise, MultipleChoiceExercise, SessionAnswer
from app.services import review_rules as rules

NOW = datetime(2026, 11, 8, 12, 0, tzinfo=timezone.utc)


def card(
    card_id: str,
    *,
    kanji: str = "食券",
    meaning: str = "meal ticket",
    strength: int = 0,
    due_in: timedelta = timedelta(0),
    places: tuple[str, ...] = ("Koenji",),
    image: bool = False,
) -> FlashcardResponse:
    return FlashcardResponse(
        flashcard_id=card_id,
        capture_id="cap",
        image_url="https://example.com/p.jpg" if image else "",
        bounding_box=[Vertex(x=0.4, y=0.4), Vertex(x=0.6, y=0.5)] if image else [],
        kanji=kanji,
        reading="しょっけん",
        romaji="shokken",
        meaning=meaning,
        part_of_speech="Noun",
        use_cases=[UseCaseExample(japanese="食券です", reading="しょっけんです", english="It's a ticket")],
        review_stats=ReviewStats(next_review_at=NOW + due_in),
        created_at=NOW,
        strength=strength,
        sightings=[
            Sighting(sighting_id=f"s{i}", place_name=p, seen_at=NOW - timedelta(days=i))
            for i, p in enumerate(places)
        ],
    )


class TestPicking:
    def test_only_due_cards_without_collection(self) -> None:
        cards = [card("a"), card("b", due_in=timedelta(days=2))]
        assert [c.flashcard_id for c in rules.pick_session_cards(cards, NOW)] == ["a"]

    def test_weakest_first(self) -> None:
        cards = [card("strong", strength=3), card("weak", strength=0)]
        assert [c.flashcard_id for c in rules.pick_session_cards(cards, NOW)] == ["weak", "strong"]

    def test_collection_fills_with_not_yet_due(self) -> None:
        cards = [card("due"), card("later", due_in=timedelta(days=2)), card("elsewhere", places=("Nakano",))]
        picked = rules.pick_session_cards(cards, NOW, collection="place:Koenji")
        assert [c.flashcard_id for c in picked] == ["due", "later"]

    def test_place_cue_needs_a_named_place(self) -> None:
        cards = [card("named"), card("unnamed", places=())]
        picked = rules.pick_session_cards(cards, NOW, collection=rules.PLACE_CUE_COLLECTION)
        assert [c.flashcard_id for c in picked] == ["named"]

    def test_session_size_cap(self) -> None:
        cards = [card(str(i)) for i in range(15)]
        assert len(rules.pick_session_cards(cards, NOW)) == rules.SESSION_SIZE


class TestExercises:
    def test_fill_gap_for_photo_cards_at_even_positions(self) -> None:
        c = card("a", image=True)
        d = rules.complete_distractors(c, None, [])
        assert isinstance(rules.build_exercise(c, d, 0, "rs"), FillGapExercise)
        assert isinstance(rules.build_exercise(c, d, 1, "rs"), MultipleChoiceExercise)

    def test_no_photo_means_multiple_choice(self) -> None:
        c = card("a")
        d = rules.complete_distractors(c, None, [])
        assert isinstance(rules.build_exercise(c, d, 0, "rs"), MultipleChoiceExercise)

    def test_answer_index_points_at_correct_option(self) -> None:
        c = card("a", image=True)
        d = rules.complete_distractors(c, None, [])
        mc = rules.build_exercise(c, d, 1, "rs")
        assert isinstance(mc, MultipleChoiceExercise)
        assert mc.options[mc.answer_index] == "meal ticket"
        assert len(mc.options) == 4
        gap = rules.build_exercise(c, d, 0, "rs")
        assert isinstance(gap, FillGapExercise)
        assert gap.options[gap.answer_index].text == "食券"

    def test_gap_box_padded_and_clamped(self) -> None:
        box = rules.gap_from_bbox([Vertex(x=0.0, y=0.5), Vertex(x=0.3, y=0.6)])
        assert box.x == 0.0
        assert abs(box.w - 0.32) < 1e-9
        assert abs(box.y - 0.48) < 1e-9


class TestDistractors:
    def test_gemini_first_then_other_cards_then_fallback(self) -> None:
        c = card("a")
        other = card("b", kanji="替え玉", meaning="noodle refill")
        found = Distractors(meanings=["receipt"], words=[JpOption(text="会計")])
        d = rules.complete_distractors(c, found, [c, other])
        assert d.meanings[:2] == ["receipt", "noodle refill"]
        assert [w.text for w in d.words[:2]] == ["会計", "替え玉"]
        assert len(d.meanings) == 3 and len(d.words) == 3

    def test_never_includes_the_right_answer(self) -> None:
        c = card("a")
        found = Distractors(meanings=["Meal Ticket", "exit"], words=[JpOption(text="食券")])
        d = rules.complete_distractors(c, found, [])
        assert "meal ticket" not in [m.lower() for m in d.meanings]
        assert "食券" not in [w.text for w in d.words]


def answer(card_id: str, before: int, after: int, correct: bool = True, area: str = "Koenji") -> SessionAnswer:
    return SessionAnswer(
        flashcard_id=card_id,
        correct=correct,
        strength_before=before,
        strength_after=after,
        at=NOW,
        text=card_id,
        area=area,
    )


class TestResults:
    def test_reaching_a_star_is_the_biggest_win(self) -> None:
        win = rules.biggest_win([answer("a", 0, 2), answer("b", 3, 4)])
        assert win is not None and win.flashcard_id == "b"
        assert win.title == "is now a star"

    def test_no_win_when_nothing_improved(self) -> None:
        assert rules.biggest_win([answer("a", 2, 1, correct=False)]) is None

    def test_by_area_counts_distinct_cards(self) -> None:
        counts = rules.answered_by_area(
            [answer("a", 0, 1), answer("a", 1, 2), answer("b", 0, 1, area="Nakano")]
        )
        assert {c.area: c.count for c in counts} == {"Koenji": 1, "Nakano": 1}

    def test_minutes(self) -> None:
        late = answer("a", 0, 1)
        late.at = NOW + timedelta(seconds=90)
        assert rules.session_minutes(NOW, [late]) == 2
        assert rules.session_minutes(NOW, []) == 0
