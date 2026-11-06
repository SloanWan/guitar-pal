from pathlib import Path

import pytest

from evals.tab.run import PROMPT_ID, Exercise, add_case, finish_subject, reader_for, subject_summary
from evals.tab.score import score_reading
from tests.test_tab_score import BAR, slot, tab


def exercise(id="syt-p106-1", gold=None):
    record = {"id": id, "page": 106, "status": "corrected", "gold": gold or tab(BAR)}
    return Exercise("books-batch1", record, Path(f"crops/{id}.png"))


def test_the_prompt_id_is_short_and_stable():
    assert len(PROMPT_ID) == 8
    assert int(PROMPT_ID, 16) >= 0


def test_an_exercise_is_grouped_by_its_book_else_by_its_set():
    assert exercise("sample-text-tab-6p-p002-3").book == "sample-text-tab-6p"
    assert exercise("p0002-r1-1").book == "books-batch1"


def test_a_bailian_reader_without_a_price_is_refused_before_it_spends(monkeypatch):
    monkeypatch.setenv("DASHSCOPE_API_KEY", "k")
    with pytest.raises(SystemExit):
        reader_for("bailian:unpriced")


def test_the_summary_counts_repairs_and_averages_cost_over_readings_that_finished():
    readings = [
        {"draft": tab(BAR), "calls": 1, "cost_usd": 0.01, "seconds": 10.0},
        {"draft": None, "calls": 2, "cost_usd": 0.03, "seconds": 30.0, "dropped": True},
        {"error": "RateLimitError: 429"},
    ]
    gold = tab(BAR)
    scores = [score_reading(r["draft"], gold) for r in readings[:2]]
    s = subject_summary(scores, readings)
    assert s["repaired"] == 1
    assert s["drafted"] == 0.5
    assert s["cost_per_exercise_usd"] == pytest.approx(0.02)
    assert s["seconds_per_exercise"] == pytest.approx(20.0)


def test_a_case_carries_its_repeat_and_a_broken_call_is_an_error_not_a_score():
    run = {"cases": []}
    ex = exercise()
    wrong = tab([slot(A=0), slot(D=2), slot(G=0), slot(B=3)])
    sc = add_case(run, "m", ex, 2, {"draft": wrong, "warnings": [], "cost_usd": 0.01})
    assert add_case(run, "m", ex, 1, {"error": "boom"}) is None
    scored, broken = run["cases"]
    assert scored["repeat"] == 2 and scored["pass"] is False
    assert scored["metrics"]["cost_usd"] == 0.01
    assert scored["detail"]["book"] == "syt"
    assert broken == {
        "subject": "m",
        "case": "books-batch1/syt-p106-1",
        "repeat": 1,
        "error": "boom",
        "metrics": {},
    }
    assert sc is not None and sc.matched_notes == 3


def test_a_subject_is_summarised_per_book_and_per_repeat():
    right, wrong = tab(BAR), tab([slot(A=0), slot(D=2), slot(G=0), slot(B=3)])
    a, b = exercise("syt-p106-1"), exercise("heavy-metal-p013-1")
    done = [
        (a, 1, {"draft": right}, score_reading(right, a.record["gold"])),
        (b, 1, {"draft": right}, score_reading(right, b.record["gold"])),
        (a, 2, {"draft": wrong}, score_reading(wrong, a.record["gold"])),
        (b, 2, {"error": "boom"}, None),
    ]
    subject: dict = {}
    finish_subject(subject, done)
    assert set(subject["breakdown"]) == {"syt", "heavy-metal"}
    assert subject["by_repeat"]["1"]["exact"] == 1.0
    assert subject["by_repeat"]["2"]["exact"] == 0.0
    assert subject["summary"]["exercises"] == 3
