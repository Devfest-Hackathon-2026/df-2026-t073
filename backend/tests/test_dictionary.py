import pytest

from app.services import dictionary
from app.services.dictionary import card_from_entry, normalize, pos_label, to_hiragana, to_romaji


@pytest.mark.parametrize(
    ("kana", "romaji"),
    [
        ("しょっけん", "shokken"),
        ("きっぷ", "kippu"),
        ("まっちゃ", "matcha"),
        ("ちゅうもん", "chuumon"),
        ("じゃあ", "jaa"),
        ("きんえん", "kin'en"),
        ("コーヒー", "kōhī"),
        ("ラーメン", "rāmen"),
        ("おおもり", "oomori"),
    ],
)
def test_romaji(kana, romaji):
    assert to_romaji(kana) == romaji


def test_hiragana_and_normalize():
    assert to_hiragana("ラーメン") == "らーめん"
    assert normalize(" ﾗｰﾒﾝ ") == "ラーメン"


def test_pos_labels():
    assert pos_label(["n", "vs"]) == "Noun"
    assert pos_label(["v5u", "vt"]) == "Godan verb"
    assert pos_label(["exp"]) == "Expression"
    assert pos_label([]) == "Word"


ENTRY = {
    "kanji": [{"text": "食券", "common": True}],
    "kana": [{"text": "しょっけん", "common": True, "applies": ["*"]}],
    "sense": [{"pos": ["n"], "applies_kanji": ["*"], "gloss": ["meal ticket", "food ticket", "food voucher", "coupon"]}],
}


def test_card_from_kanji_form():
    card = card_from_entry("食券", ENTRY)
    assert card.reading == "しょっけん"
    assert card.romaji == "shokken"
    assert card.meaning == "meal ticket; food ticket; food voucher"
    assert card.part_of_speech == "Noun"
    assert not card.is_phrase


def test_card_from_kana_form_uses_it_as_reading():
    card = card_from_entry("しょっけん", ENTRY)
    assert card.text == "しょっけん"
    assert card.reading == "しょっけん"


@pytest.mark.skipif(not dictionary.DB_PATH.exists(), reason="JMdict database not built")
def test_lookup_real_db():
    card = dictionary.lookup("営業中")
    assert card is not None
    assert card.reading == "えいぎょうちゅう"
    assert dictionary.lookup("温泉水99") is None
