import pytest

from app.schemas.flashcard import (
    QuestionType,
)
from app.services.review_rules.grading import (
    check_card_answer,
    has_non_kana_for_reading,
)
from tests.review_rules.factories import card


class TestAnswerChecking:
    @pytest.mark.parametrize(
        ("qtype", "kanji", "reading", "meaning", "synonyms", "given", "expected"),
        [
            # Exact kana match
            (
                "fill_text_reading",
                "食券",
                "しょっけん",
                "meal ticket",
                [],
                "しょっけん",
                True,
            ),
            # Hiragana == Katakana (including half-width NFKC)
            ("fill_text_reading", "珈琲", "こーひー", "coffee", [], "コーヒー", True),
            (
                "fill_text_reading",
                "コーヒー",
                "こーひー",
                "coffee",
                [],
                "こーひー",
                True,
            ),
            ("fill_text_reading", "コーヒー", "こーひー", "coffee", [], "ｺｰﾋｰ", True),
            # One wrong kana or wrong long-vowel spelling fails
            (
                "fill_text_reading",
                "食券",
                "しょっけん",
                "meal ticket",
                [],
                "しょけん",
                False,
            ),
            (
                "fill_text_reading",
                "コーヒー",
                "こーひー",
                "coffee",
                [],
                "こおひい",
                False,
            ),
            # Romaji is never accepted
            (
                "fill_text_reading",
                "食券",
                "しょっけん",
                "meal ticket",
                [],
                "shokken",
                False,
            ),
            (
                "fill_text_reverse",
                "食券",
                "しょっけん",
                "meal ticket",
                [],
                "shokken",
                False,
            ),
            (
                "fill_object_name",
                "食券",
                "しょっけん",
                "meal ticket",
                [],
                "shokken",
                False,
            ),
            # Reverse and object_name accept both kanji and kana reading
            (
                "fill_text_reverse",
                "食券",
                "しょっけん",
                "meal ticket",
                [],
                "食券",
                True,
            ),
            (
                "fill_text_reverse",
                "食券",
                "しょっけん",
                "meal ticket",
                [],
                "しょっけん",
                True,
            ),
            (
                "fill_text_reverse",
                "食券",
                "しょっけん",
                "meal ticket",
                [],
                "ショッケン",
                True,
            ),
            (
                "fill_object_name",
                "傘立て",
                "かさたて",
                "umbrella stand",
                [],
                "傘立て",
                True,
            ),
            (
                "fill_object_name",
                "傘立て",
                "かさたて",
                "umbrella stand",
                [],
                "かさたて",
                True,
            ),
            # Reading rejects kanji (triggers kana warning)
            (
                "fill_text_reading",
                "食券",
                "しょっけん",
                "meal ticket",
                [],
                "食券",
                False,
            ),
            # Meaning exact match, glosses, synonyms, leading articles
            (
                "fill_text_translate",
                "食券",
                "しょっけん",
                "meal ticket; food voucher",
                ["coupon"],
                "meal ticket",
                True,
            ),
            (
                "fill_text_translate",
                "食券",
                "しょっけん",
                "meal ticket; food voucher",
                ["coupon"],
                "a meal ticket",
                True,
            ),
            (
                "fill_text_translate",
                "食券",
                "しょっけん",
                "meal ticket; food voucher",
                ["coupon"],
                "Food Voucher",
                True,
            ),
            (
                "fill_text_translate",
                "食券",
                "しょっけん",
                "meal ticket; food voucher",
                ["coupon"],
                "coupon",
                True,
            ),
            # Typos in meaning are rejected
            (
                "fill_text_translate",
                "食券",
                "しょっけん",
                "meal ticket",
                [],
                "meel ticket",
                False,
            ),
            # Fragments inside one gloss are not accepted on their own
            (
                "fill_text_translate",
                "電源",
                "でんげん",
                "on/off switch",
                [],
                "on",
                False,
            ),
            (
                "fill_text_translate",
                "千円札",
                "せんえんさつ",
                "1,000 yen bill",
                [],
                "1",
                False,
            ),
            (
                "fill_text_translate",
                "千円札",
                "せんえんさつ",
                "1,000 yen bill",
                [],
                "1,000 yen bill",
                True,
            ),
            # Comma separates whole glosses, with or without a space
            (
                "fill_text_translate",
                "出口",
                "でぐち",
                "exit, way out",
                [],
                "exit",
                True,
            ),
            (
                "fill_text_translate",
                "出口",
                "でぐち",
                "exit,way out",
                [],
                "way out",
                True,
            ),
            # Single words around a slash are alternatives
            (
                "fill_text_translate",
                "お手洗い",
                "おてあらい",
                "toilet/restroom",
                [],
                "restroom",
                True,
            ),
            (
                "fill_text_translate",
                "お手洗い",
                "おてあらい",
                "toilet/restroom",
                [],
                "toilet",
                True,
            ),
            (
                "fill_text_translate",
                "食券",
                "しょっけん",
                "meal ticket / food voucher",
                [],
                "food voucher",
                True,
            ),
            (
                "fill_text_translate",
                "年中無休",
                "ねんじゅうむきゅう",
                "24/7",
                [],
                "24",
                False,
            ),
        ],
    )
    def test_answer_grading_table(
        self,
        qtype: QuestionType,
        kanji: str,
        reading: str,
        meaning: str,
        synonyms: list[str],
        given: str,
        expected: bool,
    ) -> None:
        c = card(
            "c",
            kanji=kanji,
            reading=reading,
            meaning=meaning,
            synonyms=synonyms,
            stage="fill",
        )
        assert check_card_answer(c, qtype, given) is expected

    def test_kana_only_warning_detection(self) -> None:
        assert has_non_kana_for_reading("食券") is True
        assert has_non_kana_for_reading("shokken") is True
        assert has_non_kana_for_reading("しょっけん") is False
        assert has_non_kana_for_reading("コーヒー") is False
