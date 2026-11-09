"""Offline tests: fake Gemini JSON in, app objects out. No API calls."""

import pytest

from app.services import rehearsal_rules as rules


def jp(text: str, meaning: str = "") -> dict:
    return {"text": text, "reading": text, "romaji": "x", "meaning": meaning}


def choice(text: str, ok: bool, label: str = "") -> dict:
    return {**jp(text, text), "ok": ok, "label": label, "note": "n", "why_suggestion": "" if ok else "better"}


def exchange(n: int, choices: list[dict]) -> dict:
    return {
        "staff": jp(f"staff{n}", f"staff {n}"),
        "model_reply": jp(f"reply{n}", f"reply {n}"),
        "hint": f"hint {n}",
        "choices": choices,
    }


FAKE_SCRIPT = {
    "staff_voice": "Counter staff",
    "exchanges": [
        exchange(1, [choice("a", True), choice("b", False), choice("c", False)]),
        exchange(2, [choice("d", False), choice("e", False), choice("f", False)]),  # no natural one
        {"staff": jp(""), "model_reply": jp("x"), "hint": "", "choices": []},  # unusable, skipped
    ],
}


class TestScript:
    def test_alternates_staff_and_user(self) -> None:
        script = rules.parse_script(FAKE_SCRIPT, seed="place")
        assert [t.speaker for t in script.turns] == ["staff", "user", "staff", "user"]
        assert [t.id for t in script.turns] == ["s1", "u1", "s2", "u2"]

    def test_every_user_turn_has_three_choices_with_a_natural_one(self) -> None:
        script = rules.parse_script(FAKE_SCRIPT, seed="place")
        for turn in script.turns:
            if turn.speaker == "user":
                assert len(turn.choices) == 3
                assert any(c.ok for c in turn.choices)

    def test_wrong_choices_suggest_the_model_reply(self) -> None:
        script = rules.parse_script(FAKE_SCRIPT, seed="place")
        wrong = [c for c in script.turns[1].choices if not c.ok]
        assert all(c.suggestion and c.suggestion.jp.text == "reply1" for c in wrong)

    def test_shuffle_is_stable_per_seed(self) -> None:
        a = rules.parse_script(FAKE_SCRIPT, seed="place")
        b = rules.parse_script(FAKE_SCRIPT, seed="place")
        assert [c.jp.text for c in a.turns[1].choices] == [c.jp.text for c in b.turns[1].choices]

    def test_empty_script_is_rejected(self) -> None:
        with pytest.raises(ValueError):
            rules.parse_script({"exchanges": []}, seed="x")


class TestAnswers:
    def setup_method(self) -> None:
        self.turns = rules.parse_script(FAKE_SCRIPT, seed="place").turns
        self.user_turn = self.turns[1]

    def test_choice_answer(self) -> None:
        index = next(i for i, c in enumerate(self.user_turn.choices) if c.ok)
        result = rules.result_from_choice(self.turns, self.user_turn, index)
        assert result.ok and not result.spoken
        assert result.staff.text == "staff1"

    def test_spoken_answer_ok(self) -> None:
        raw = {"transcript": jp("reply1", "reply 1"), "understood": True, "ok": True, "label": "Natural", "note": "Good", "why_suggestion": ""}
        result = rules.result_from_audio(self.turns, self.user_turn, raw)
        assert result.ok and result.spoken and result.suggestion is None
        assert result.said.text == "reply1"

    def test_unclear_audio_is_not_ok(self) -> None:
        raw = {"transcript": jp(""), "understood": False, "ok": True, "label": "", "note": "", "why_suggestion": ""}
        result = rules.result_from_audio(self.turns, self.user_turn, raw)
        assert not result.ok
        assert result.suggestion is not None and result.suggestion.jp.text == "reply1"


class TestBriefing:
    def test_trimmed_to_screen_sizes(self) -> None:
        raw = {
            "steps": ["one", "two", "three", "four", " "],
            "tango": [jp(f"w{i}", "m") for i in range(6)] + [jp("")],
            "source": " Based on Google reviews ",
        }
        content = rules.parse_briefing(raw)
        assert content.steps == ["one", "two", "three"]
        assert [t.text for t in content.tango] == ["w0", "w1", "w2", "w3"]
        assert content.source == "Based on Google reviews"


def test_tts_cache_key_depends_on_text_and_speed() -> None:
    assert rules.tts_cache_key("いらっしゃいませ", "natural") == rules.tts_cache_key("いらっしゃいませ", "natural")
    assert rules.tts_cache_key("いらっしゃいませ", "natural") != rules.tts_cache_key("いらっしゃいませ", "slower")
    assert rules.tts_cache_key("a", "natural").startswith("tts/")


class TestNormalizeLanguage:
    def test_valid_languages_normalized(self) -> None:
        assert rules.normalize_language("english") == "English"
        assert rules.normalize_language("  JAPANESE  ") == "Japanese"
        assert rules.normalize_language("French") == "French"

    def test_invalid_or_malicious_languages_raise(self) -> None:
        with pytest.raises(ValueError, match="Unsupported language"):
            rules.normalize_language("../../etc/passwd")

        with pytest.raises(ValueError, match="Unsupported language"):
            rules.normalize_language("")

        with pytest.raises(ValueError, match="Unsupported language"):
            rules.normalize_language("klingon")
