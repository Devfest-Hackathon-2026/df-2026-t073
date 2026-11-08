from datetime import datetime, timedelta, timezone

import pytest

from app.schemas.capture import Vertex
from app.schemas.flashcard import (
    CaptureFormat,
    Distractors,
    FlashcardResponse,
    JpOption,
    QuestionType,
    ReviewStage,
    ReviewStats,
    Sighting,
    TangoKind,
    UseCaseExample,
)
from app.schemas.review import (
    FillBlankExercise,
    FlashcardExercise,
    McqExercise,
    SessionAnswer,
)
from app.services import review_rules as rules

NOW = datetime(2026, 11, 8, 12, 0, tzinfo=timezone.utc)


def card(
    card_id: str,
    *,
    kanji: str = "食券",
    reading: str = "しょっけん",
    romaji: str = "shokken",
    meaning: str = "meal ticket",
    synonyms: list[str] | None = None,
    kind: TangoKind = "word",
    capture_format: CaptureFormat | None = None,
    strength: int = 0,
    stage: ReviewStage | None = None,
    stage_streak: int = 0,
    miss_streak: int = 0,
    last_question_type: QuestionType | None = None,
    due_in: timedelta = timedelta(0),
    places: tuple[str, ...] = ("Koenji",),
    image: bool = False,
) -> FlashcardResponse:
    return FlashcardResponse(
        flashcard_id=card_id,
        capture_id="cap" if image else "",
        image_url="https://example.com/p.jpg" if image else "",
        bounding_box=[Vertex(x=0.4, y=0.4), Vertex(x=0.6, y=0.5)] if image else [],
        kanji=kanji,
        reading=reading,
        romaji=romaji,
        meaning=meaning,
        meaning_synonyms=synonyms or [],
        part_of_speech="Noun",
        kind=kind,
        capture_format=capture_format,
        use_cases=[
            UseCaseExample(
                japanese=f"{kanji}をお願いします。",
                reading=f"{reading}をおねがいします。",
                english="Ticket, please.",
            )
        ],
        review_stats=ReviewStats(
            next_review_at=NOW + due_in,
            stage=stage,
            stage_streak=stage_streak,
            miss_streak=miss_streak,
            last_question_type=last_question_type,
        ),
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

    def test_area_collection_uses_place_areas(self) -> None:
        koenji = card("k", places=("Koenji Station",))
        koenji.sightings[0].place_id = "p1"
        nakano = card("n", places=("Nakano Station",))
        picked = rules.pick_session_cards(
            [koenji, nakano], NOW, collection="area:koenji", area_by_place={"p1": "Koenji"}
        )
        assert [c.flashcard_id for c in picked] == ["k"]

    def test_session_size_cap(self) -> None:
        cards = [card(str(i)) for i in range(15)]
        assert len(rules.pick_session_cards(cards, NOW)) == rules.SESSION_SIZE

    def test_order_session_cards_easiest_to_hardest(self) -> None:
        c_fill = card("fill", stage="fill", strength=4)
        c_mcq = card("mcq", stage="mcq", strength=3)
        c_mcq_photo = card("mcq_photo", stage="mcq_photo", strength=2, image=True)
        c_flash = card("flash", stage="flashcard", strength=0)
        ordered = rules.order_session_cards([c_fill, c_mcq, c_mcq_photo, c_flash])
        assert [c.flashcard_id for c in ordered] == ["flash", "mcq_photo", "mcq", "fill"]


class TestFormatAndStages:
    def test_capture_format_stored_and_inferred_from_kind(self) -> None:
        # Older card with no capture_format falls back to kind == 'object'.
        old_obj = card("o", kind="object")
        old_word = card("w", kind="menu_item")
        # Explicit capture_format overrides Gemini's kind (e.g. OCR text labelled 'object').
        ocr_labelled_obj = card("t", kind="object", capture_format="text")
        assert rules.capture_format(old_obj) == "object"
        assert rules.capture_format(old_word) == "text"
        assert rules.capture_format(ocr_labelled_obj) == "text"

    def test_infer_stage_for_old_cards(self) -> None:
        assert card("s0", strength=0, image=True).review_stats.stage == "flashcard"
        assert card("s1", strength=1, image=True).review_stats.stage == "flashcard"
        assert card("s2_text_photo", strength=2, image=True).review_stats.stage == "mcq_photo"
        assert card("s2_text_no_photo", strength=2, image=False).review_stats.stage == "mcq"
        assert card("s2_obj", strength=2, kind="object", image=True).review_stats.stage == "mcq"
        assert card("s3", strength=3, image=True).review_stats.stage == "mcq"
        assert card("s4", strength=4, image=True).review_stats.stage == "fill"

    def test_stage_paths(self) -> None:
        assert rules.stage_path("text", has_photo=True) == ("flashcard", "mcq_photo", "mcq", "fill")
        assert rules.stage_path("text", has_photo=False) == ("flashcard", "mcq", "fill")
        assert rules.stage_path("object", has_photo=True) == ("flashcard", "mcq", "fill")

    def test_text_card_promotion_and_demotion(self) -> None:
        stats = ReviewStats(next_review_at=NOW, stage="flashcard")
        # 2 good flashcard reviews -> mcq_photo
        stats = rules.next_stage(stats, "text", True, has_photo=True)
        assert stats.stage == "flashcard" and stats.stage_streak == 1
        stats = rules.next_stage(stats, "text", True, has_photo=True)
        assert stats.stage == "mcq_photo" and stats.stage_streak == 0

        # 2 correct photo MCQs -> plain-text mcq
        stats = rules.next_stage(stats, "text", True, has_photo=True)
        assert stats.stage == "mcq_photo" and stats.stage_streak == 1
        stats = rules.next_stage(stats, "text", True, has_photo=True)
        assert stats.stage == "mcq" and stats.stage_streak == 0

        # 3 correct plain-text MCQs -> fill
        for expected_streak in (1, 2):
            stats = rules.next_stage(stats, "text", True, has_photo=True)
            assert stats.stage == "mcq" and stats.stage_streak == expected_streak
        stats = rules.next_stage(stats, "text", True, has_photo=True)
        assert stats.stage == "fill" and stats.stage_streak == 0

        # 2 wrong in a row at fill -> back to plain-text mcq
        stats = rules.next_stage(stats, "text", False, has_photo=True)
        assert stats.stage == "fill" and stats.miss_streak == 1
        stats = rules.next_stage(stats, "text", False, has_photo=True)
        assert stats.stage == "mcq" and stats.miss_streak == 0

        # 2 wrong in a row at plain-text mcq -> back to mcq_photo
        stats = rules.next_stage(stats, "text", False, has_photo=True)
        stats = rules.next_stage(stats, "text", False, has_photo=True)
        assert stats.stage == "mcq_photo" and stats.miss_streak == 0

    def test_object_card_skips_mcq_photo(self) -> None:
        stats = ReviewStats(next_review_at=NOW, stage="flashcard")
        stats = rules.next_stage(stats, "object", True)
        stats = rules.next_stage(stats, "object", True)
        assert stats.stage == "mcq" and stats.stage_streak == 0
        for _ in range(3):
            stats = rules.next_stage(stats, "object", True)
        assert stats.stage == "fill"
        # 2 misses from mcq on an object card go straight back to flashcard
        stats = ReviewStats(next_review_at=NOW, stage="mcq")
        stats = rules.next_stage(stats, "object", False)
        stats = rules.next_stage(stats, "object", False)
        assert stats.stage == "flashcard"

    def test_no_photo_text_card_skips_mcq_photo(self) -> None:
        stats = ReviewStats(next_review_at=NOW, stage="flashcard")
        stats = rules.next_stage(stats, "text", True, has_photo=False)
        stats = rules.next_stage(stats, "text", True, has_photo=False)
        assert stats.stage == "mcq"

    def test_interrupted_streak_resets(self) -> None:
        stats = ReviewStats(next_review_at=NOW, stage="mcq", stage_streak=2)
        stats = rules.next_stage(stats, "text", False, has_photo=True)
        assert stats.stage == "mcq" and stats.stage_streak == 0 and stats.miss_streak == 1
        stats = rules.next_stage(stats, "text", True, has_photo=True)
        assert stats.stage == "mcq" and stats.stage_streak == 1 and stats.miss_streak == 0

    def test_shows_photo_for_every_stage_and_format(self) -> None:
        # Text Tango with photo: flashcard and mcq_photo show photo; mcq and fill do not.
        assert rules.shows_photo("flashcard", "text", has_photo=True) is True
        assert rules.shows_photo("mcq_photo", "text", has_photo=True) is True
        assert rules.shows_photo("mcq", "text", has_photo=True) is False
        assert rules.shows_photo("fill", "text", has_photo=True) is False
        # Object Tango with photo: always shows photo.
        for s in ("flashcard", "mcq", "fill"):
            assert rules.shows_photo(s, "object", has_photo=True) is True  # type: ignore[arg-type]
        # Without a photo: never shows photo.
        assert rules.shows_photo("flashcard", "text", has_photo=False) is False

    def test_rating_rule(self) -> None:
        assert rules.rating_for_answer("fill_text_translate", True, "good") == "easy"
        assert rules.rating_for_answer("fill_object_name", False, "easy") == "again"
        assert rules.rating_for_answer("mcq_text_reading", True, "easy") == "good"
        assert rules.rating_for_answer("mcq_object_name", False, "good") == "again"
        assert rules.rating_for_answer("flashcard_text", True, "easy") == "easy"
        assert rules.rating_for_answer("flashcard_object", True, "good") == "good"
        assert rules.rating_for_answer("flashcard_text", False, "again") == "again"

    def test_backfill_photo_from_later_sighting(self) -> None:
        live_card = card("live", image=False)
        photo_sighting = Sighting(
            sighting_id="st_photo",
            capture_id="cap_new",
            place_name="Koenji",
            seen_at=NOW,
            image_url="https://example.com/caught.jpg",
        )
        bbox = [Vertex(x=0.2, y=0.2), Vertex(x=0.5, y=0.4)]
        updates = rules.backfill_photo_fields(live_card, photo_sighting, bbox)
        updated = live_card.model_copy(update=updates)
        assert rules.can_fill_gap(updated) is True
        assert updated.image_url == "https://example.com/caught.jpg"
        assert updated.capture_id == "cap_new"
        assert len(updated.bounding_box) == 2


class TestQuestionPicking:
    def test_filters_by_format_and_stage(self) -> None:
        assert rules.pick_question_type(card("a", stage="flashcard", image=True)) == "flashcard_text"
        assert (
            rules.pick_question_type(card("b", capture_format="object", stage="flashcard", image=True))
            == "flashcard_object"
        )
        assert (
            rules.pick_question_type(card("c", capture_format="object", stage="mcq", image=True))
            == "mcq_object_name"
        )
        assert (
            rules.pick_question_type(card("d", capture_format="object", stage="fill", image=True))
            == "fill_object_name"
        )

    def test_mcq_photo_only_asks_translate(self) -> None:
        c = card("a", stage="mcq_photo", image=True)
        for i in range(10):
            assert rules.pick_question_type(c, seed=str(i)) == "mcq_text_translate"

    def test_skips_reading_when_word_is_all_kana(self) -> None:
        hira = card("h", kanji="かえだま", reading="かえだま", stage="mcq")
        kata = card("k", kanji="コーヒー", reading="こーひー", stage="fill")
        for i in range(20):
            assert rules.pick_question_type(hira, seed=str(i)) != "mcq_text_reading"
            assert rules.pick_question_type(kata, seed=str(i)) != "fill_text_reading"

    def test_rotates_away_from_last_question_type(self) -> None:
        for last in ("mcq_text_reading", "mcq_text_translate", "mcq_text_reverse"):
            c = card("a", stage="mcq", last_question_type=last)  # type: ignore[arg-type]
            for i in range(10):
                assert rules.pick_question_type(c, seed=str(i)) != last


class TestDistractors:
    def test_gemini_first_then_other_cards_then_fallback(self) -> None:
        c = card("a")
        other = card("b", kanji="替え玉", reading="かえだま", meaning="noodle refill")
        found = Distractors(
            meanings=["receipt"],
            words=[JpOption(text="会計", reading="かいけい", romaji="kaikei")],
            readings=["しょくけん"],
        )
        d = rules.complete_distractors(c, found, [c, other])
        assert d.meanings[:2] == ["receipt", "noodle refill"]
        assert [w.text for w in d.words[:2]] == ["会計", "替え玉"]
        assert d.readings[:2] == ["しょくけん", "かえだま"]
        assert len(d.meanings) == 3 and len(d.words) == 3 and len(d.readings) == 3

    def test_prefers_same_capture_format_cards(self) -> None:
        obj = card("obj1", kanji="券売機", reading="けんばいき", meaning="ticket machine", capture_format="object")
        text_other = card("txt", kanji="出口", reading="でぐち", meaning="exit", capture_format="text")
        obj_other = card("obj2", kanji="傘立て", reading="かさたて", meaning="umbrella stand", capture_format="object")
        d = rules.complete_distractors(obj, None, [obj, text_other, obj_other])
        assert d.words[0].text == "傘立て"

    def test_never_includes_the_right_answer_or_synonyms(self) -> None:
        c = card("a", meaning="meal ticket; voucher", synonyms=["food coupon"])
        found = Distractors(
            meanings=["Meal Ticket", "voucher", "food coupon", "exit"],
            words=[JpOption(text="食券", reading="しょっけん")],
            readings=["しょっけん", "しょくけん"],
        )
        d = rules.complete_distractors(c, found, [])
        lowered = [m.lower() for m in d.meanings]
        assert "meal ticket" not in lowered
        assert "voucher" not in lowered
        assert "food coupon" not in lowered
        assert "食券" not in [w.text for w in d.words]
        assert "しょっけん" not in d.readings


class TestExercises:
    def test_flashcard_exercise_shows_photo_for_text_and_object(self) -> None:
        txt = card("t", stage="flashcard", image=True)
        obj = card("o", capture_format="object", stage="flashcard", image=True)
        d = rules.complete_distractors(txt, None, [])
        ex_txt = rules.build_exercise(txt, d, 0, "rs")
        ex_obj = rules.build_exercise(obj, d, 1, "rs")
        assert isinstance(ex_txt, FlashcardExercise)
        assert ex_txt.question_type == "flashcard_text"
        assert ex_txt.photo is not None
        assert ex_txt.front is not None and ex_txt.front.text == "食券"
        assert isinstance(ex_obj, FlashcardExercise)
        assert ex_obj.question_type == "flashcard_object"
        assert ex_obj.photo is not None
        assert ex_obj.front is None

    def test_mcq_photo_vs_plain_text_and_object(self) -> None:
        c_photo = card("p", stage="mcq_photo", image=True)
        c_plain = card("t", stage="mcq", image=True, last_question_type="mcq_text_reading")
        c_obj = card("o", capture_format="object", stage="mcq", image=True)
        d = rules.complete_distractors(c_photo, None, [])

        ex_photo = rules.build_exercise(c_photo, d, 0, "rs")
        assert isinstance(ex_photo, McqExercise)
        assert ex_photo.question_type == "mcq_text_translate"
        assert ex_photo.photo is not None
        assert ex_photo.options[ex_photo.answer_index] == "meal ticket"
        assert len(set(ex_photo.options)) == 4

        ex_plain = rules.build_exercise(c_plain, d, 1, "rs")
        assert isinstance(ex_plain, McqExercise)
        assert ex_plain.photo is None

        ex_obj = rules.build_exercise(c_obj, d, 2, "rs")
        assert isinstance(ex_obj, McqExercise)
        assert ex_obj.question_type == "mcq_object_name"
        assert ex_obj.photo is not None
        correct_opt = ex_obj.options[ex_obj.answer_index]
        assert isinstance(correct_opt, JpOption) and correct_opt.text == "食券"

    def test_fill_blank_plain_text_for_text_and_photo_for_object(self) -> None:
        c_txt = card("t", stage="fill", image=True)
        c_obj = card("o", capture_format="object", stage="fill", image=True)
        d = rules.complete_distractors(c_txt, None, [])

        ex_txt = rules.build_exercise(c_txt, d, 0, "rs")
        assert isinstance(ex_txt, FillBlankExercise)
        assert ex_txt.photo is None
        assert ex_txt.cloze is not None and "＿＿＿" in ex_txt.cloze.japanese
        assert len(ex_txt.accepted_answers) >= 1

        ex_obj = rules.build_exercise(c_obj, d, 1, "rs")
        assert isinstance(ex_obj, FillBlankExercise)
        assert ex_obj.question_type == "fill_object_name"
        assert ex_obj.photo is not None
        assert "食券" in ex_obj.accepted_answers and "しょっけん" in ex_obj.accepted_answers

    def test_gap_box_padded_and_clamped(self) -> None:
        box = rules.gap_from_bbox([Vertex(x=0.0, y=0.5), Vertex(x=0.3, y=0.6)])
        assert box.x == 0.0
        assert abs(box.w - 0.32) < 1e-9
        assert abs(box.y - 0.48) < 1e-9

    def test_exercise_types_summary_counts(self) -> None:
        cards = [
            card("a", stage="flashcard"),
            card("b", stage="mcq_photo", image=True),
            card("c", stage="mcq"),
            card("d", stage="fill", strength=4),
        ]
        summary = {t.id: t.count for t in rules.exercise_types_summary(cards)}
        assert summary == {"flashcard": 1, "mcq": 2, "fill": 1}


class TestAnswerChecking:
    @pytest.mark.parametrize(
        ("qtype", "kanji", "reading", "meaning", "synonyms", "given", "expected"),
        [
            # Exact kana match
            ("fill_text_reading", "食券", "しょっけん", "meal ticket", [], "しょっけん", True),
            # Hiragana == Katakana (including half-width NFKC)
            ("fill_text_reading", "珈琲", "こーひー", "coffee", [], "コーヒー", True),
            ("fill_text_reading", "コーヒー", "こーひー", "coffee", [], "こーひー", True),
            ("fill_text_reading", "コーヒー", "こーひー", "coffee", [], "ｺｰﾋｰ", True),
            # One wrong kana or wrong long-vowel spelling fails
            ("fill_text_reading", "食券", "しょっけん", "meal ticket", [], "しょけん", False),
            ("fill_text_reading", "コーヒー", "こーひー", "coffee", [], "こおひい", False),
            # Romaji is never accepted
            ("fill_text_reading", "食券", "しょっけん", "meal ticket", [], "shokken", False),
            ("fill_text_reverse", "食券", "しょっけん", "meal ticket", [], "shokken", False),
            ("fill_object_name", "食券", "しょっけん", "meal ticket", [], "shokken", False),
            # Reverse and object_name accept both kanji and kana reading
            ("fill_text_reverse", "食券", "しょっけん", "meal ticket", [], "食券", True),
            ("fill_text_reverse", "食券", "しょっけん", "meal ticket", [], "しょっけん", True),
            ("fill_text_reverse", "食券", "しょっけん", "meal ticket", [], "ショッケン", True),
            ("fill_object_name", "傘立て", "かさたて", "umbrella stand", [], "傘立て", True),
            ("fill_object_name", "傘立て", "かさたて", "umbrella stand", [], "かさたて", True),
            # Reading rejects kanji (triggers kana warning)
            ("fill_text_reading", "食券", "しょっけん", "meal ticket", [], "食券", False),
            # Meaning exact match, glosses, synonyms, leading articles
            ("fill_text_translate", "食券", "しょっけん", "meal ticket; food voucher", ["coupon"], "meal ticket", True),
            ("fill_text_translate", "食券", "しょっけん", "meal ticket; food voucher", ["coupon"], "a meal ticket", True),
            ("fill_text_translate", "食券", "しょっけん", "meal ticket; food voucher", ["coupon"], "Food Voucher", True),
            ("fill_text_translate", "食券", "しょっけん", "meal ticket; food voucher", ["coupon"], "coupon", True),
            # Typos in meaning are rejected
            ("fill_text_translate", "食券", "しょっけん", "meal ticket", [], "meel ticket", False),
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
        c = card("c", kanji=kanji, reading=reading, meaning=meaning, synonyms=synonyms, stage="fill")
        assert rules.check_card_answer(c, qtype, given) is expected

    def test_kana_only_warning_detection(self) -> None:
        assert rules.has_non_kana_for_reading("食券") is True
        assert rules.has_non_kana_for_reading("shokken") is True
        assert rules.has_non_kana_for_reading("しょっけん") is False
        assert rules.has_non_kana_for_reading("コーヒー") is False


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
