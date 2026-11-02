import pytest

from evals.ocr.metrics import cer, char_scores, normalize


def test_normalize_drops_whitespace_and_notation_markers():
    text = "第一章  认识吉他\n[notation: tab, 6 lines]\n左手 按弦\n"
    assert normalize(text) == "第一章认识吉他左手按弦"


def test_normalize_folds_full_width_punctuation():
    assert normalize("C调，A小调。") == normalize("C调,A小调。")


def test_cer_is_zero_for_the_same_text_and_counts_edits_over_the_reference():
    assert cer("左手按弦", "左手 按弦") == 0.0
    assert cer("左手按弦", "左手按玫") == pytest.approx(1 / 4)
    assert cer("左手按弦", "") == 1.0


def test_cer_charges_for_reading_order():
    # The same characters, two columns read across instead of down.
    assert cer("甲乙丙丁", "丙丁甲乙") > 0


def test_char_scores_ignore_order():
    scores = char_scores("甲乙丙丁", "丙丁甲乙")
    assert scores.recall == 1.0 and scores.precision == 1.0 and scores.f1 == 1.0


def test_char_scores_count_repeats_and_notation_read_as_text():
    # The reference marks the tab; the engine read its digits.
    scores = char_scores("弦弦弦\n[notation]", "弦弦0323")
    assert scores.recall == pytest.approx(2 / 3)
    assert scores.precision == pytest.approx(2 / 6)


def test_empty_reference_and_read_score_perfectly():
    assert cer("", "") == 0.0
    assert char_scores("", "").f1 == 1.0


def test_diff_segments_marks_what_a_reading_missed_and_added():
    from evals.ocr.review import diff_segments

    segs = diff_segments("左手按弦", "左手按玫了")
    assert segs == [["=", "左手按"], ["-", "弦"], ["+", "玫了"]]
    assert "".join(t for op, t in segs if op != "+") == "左手按弦"


def test_mark_checked_adds_and_removes_once():
    from evals.ocr.review import mark_checked

    meta = mark_checked({"checked": ["p02"], "pdf": "x"}, "p01", True)
    assert meta == {"checked": ["p01", "p02"], "pdf": "x"}
    assert mark_checked(meta, "p01", True)["checked"] == ["p01", "p02"]
    assert mark_checked(meta, "p02", False)["checked"] == ["p01"]
