from app.schemas.capture import DetectedItem, Vertex
from app.services.vision import box_overlap, distinct_objects


def box(x0: float, y0: float, x1: float, y1: float) -> list[Vertex]:
    return [Vertex(x=x0, y=y0), Vertex(x=x1, y=y0), Vertex(x=x1, y=y1), Vertex(x=x0, y=y1)]


def obj(name: str, score: float, b: list[Vertex]) -> DetectedItem:
    return DetectedItem(
        item_id=name,
        item_type="object",
        source_label=name,
        japanese_text=name,
        english_gloss=name,
        confidence=score,
        bounding_box=b,
    )


def test_box_overlap() -> None:
    assert box_overlap(box(0, 0, 0.5, 0.5), box(0, 0, 0.5, 0.5)) == 1.0
    assert box_overlap(box(0, 0, 0.5, 0.5), box(0.6, 0.6, 1, 1)) == 0.0
    assert box_overlap([], box(0, 0, 1, 1)) == 0.0


def test_one_thing_under_two_names_keeps_the_more_confident() -> None:
    espresso = obj("Espresso machine", 0.71, box(0.2, 0.2, 0.8, 0.8))
    coffeemaker = obj("Coffeemaker", 0.88, box(0.22, 0.21, 0.79, 0.82))
    assert [o.item_id for o in distinct_objects([espresso, coffeemaker])] == ["Coffeemaker"]


def test_separate_things_are_all_kept() -> None:
    cup = obj("Cup", 0.9, box(0.1, 0.6, 0.3, 0.9))
    machine = obj("Coffeemaker", 0.8, box(0.4, 0.1, 0.9, 0.9))
    assert len(distinct_objects([cup, machine])) == 2


def test_an_object_inside_a_bigger_one_is_kept() -> None:
    # A cup on a table: small box inside a big one, low overlap ratio.
    table = obj("Table", 0.9, box(0, 0.5, 1, 1))
    cup = obj("Cup", 0.8, box(0.4, 0.55, 0.5, 0.7))
    assert len(distinct_objects([table, cup])) == 2
