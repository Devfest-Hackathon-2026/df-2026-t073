from datetime import timedelta

from app.schemas.review import (
    SessionAnswer,
)
from app.services.review_rules.results import (
    answered_by_area,
    biggest_win,
    session_minutes,
)
from tests.review_rules.factories import NOW


def answer(
    card_id: str, before: int, after: int, correct: bool = True, area: str = "Koenji"
) -> SessionAnswer:
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
        win = biggest_win([answer("a", 0, 2), answer("b", 3, 4)])
        assert win is not None and win.flashcard_id == "b"
        assert win.title == "is now a star"

    def test_no_win_when_nothing_improved(self) -> None:
        assert biggest_win([answer("a", 2, 1, correct=False)]) is None

    def test_by_area_counts_distinct_cards(self) -> None:
        counts = answered_by_area(
            [answer("a", 0, 1), answer("a", 1, 2), answer("b", 0, 1, area="Nakano")]
        )
        assert {c.area: c.count for c in counts} == {"Koenji": 1, "Nakano": 1}

    def test_minutes(self) -> None:
        late = answer("a", 0, 1)
        late.at = NOW + timedelta(seconds=90)
        assert session_minutes(NOW, [late]) == 2
        assert session_minutes(NOW, []) == 0
