from app.services.stt import parse_transcript


def test_joins_top_alternative_of_each_result():
    body = {
        "results": [
            {"alternatives": [{"transcript": "醤油ラーメンを"}, {"transcript": "しょうゆ"}]},
            {"alternatives": [{"transcript": " ひとつください "}]},
        ]
    }
    assert parse_transcript(body) == "醤油ラーメンをひとつください"


def test_nothing_heard_is_empty():
    assert parse_transcript({}) == ""
    assert parse_transcript({"results": [{"alternatives": []}]}) == ""
