from datetime import timedelta

from app.services import review_rules as rules
from app.services.lists import apply_ids
from tests.test_review_rules import NOW, card


def test_add_appends_once_in_order():
    assert apply_ids(["a"], ["b", "a", "c", "b"], []) == ["a", "b", "c"]


def test_remove_wins_over_add():
    assert apply_ids(["a", "b"], ["c"], ["b", "c"]) == ["a"]


def test_favorites_collection_only_has_favorites():
    fav = card("fav").model_copy(update={"favorite": True})
    plain = card("plain")
    assert rules.in_collection(fav, rules.FAVORITES_COLLECTION)
    assert not rules.in_collection(plain, rules.FAVORITES_COLLECTION)


def test_list_collection_uses_the_list_ids():
    cards = [card("a", due_in=timedelta(days=3)), card("b"), card("c")]
    picked = rules.pick_session_cards(cards, NOW, f"{rules.LIST_PREFIX}ls_1", list_ids={"a", "c"})
    # Chosen collection: not-yet-due cards fill in, so "a" counts too.
    assert {c.flashcard_id for c in picked} == {"a", "c"}


def test_placeholder_place_names_are_not_places():
    from app.services.tango_rules import clean_place_name, new_sighting

    assert clean_place_name("Location off") == ""
    assert clean_place_name(" Near you ") == ""
    assert clean_place_name("Koenji") == "Koenji"
    assert new_sighting(now=NOW, capture_id=None, place_name="Location off").place_name == ""


def test_old_placeholder_sightings_are_not_an_area():
    old = card("old", places=("Location off",))
    assert rules.area_of(old) == ""
    assert rules.areas_summary([old, card("k")]) == [rules.AreaCount(area="Koenji", count=1)]
