from pathlib import Path
from types import SimpleNamespace

import pytest

from app.extract.tab import TabExtractor
from app.ingest.model import CallUsage
from app.validate import Verdict
from evals.tab.run import (
    PROMPT_ID,
    Exercise,
    add_case,
    finish_subject,
    read,
    reader_for,
    replay,
    subject_summary,
)
from evals.tab.score import score_reading
from tests.test_extract_tab import STRING_SIX
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


def test_a_reading_cut_off_by_the_cap_counts_as_truncated_and_older_readings_say_nothing():
    gold = tab(BAR)
    readings = [
        {"draft": None, "dropped": True, "calls": 1, "stop_reasons": ["max_tokens"]},
        {"draft": gold, "calls": 2, "stop_reasons": ["end_turn", "end_turn"]},
    ]
    scores = [score_reading(r["draft"], gold) for r in readings]
    assert subject_summary(scores, readings)["truncated"] == 1
    cached = [{"draft": gold, "calls": 1}]
    assert "truncated" not in subject_summary([score_reading(gold, gold)], cached)

    run = {"cases": []}
    add_case(run, "m", exercise(), 1, readings[0])
    add_case(run, "m", exercise(), 2, cached[0])
    assert run["cases"][0]["metrics"]["truncated"] == 1
    assert "truncated" not in run["cases"][1]["metrics"]


class Validator:
    """Accepts every draft, echoing it as the pattern; rejects the first `reject`."""

    def __init__(self, reject: int = 0) -> None:
        self.reject = reject
        self.drafts: list[dict] = []

    async def tab(self, draft: dict, repeats: list | None = None) -> Verdict:
        self.drafts.append(draft)
        if len(self.drafts) <= self.reject:
            return Verdict(ok=False, errors=[{"code": "BAD", "path": "measures", "message": "no"}])
        return Verdict(ok=True, pattern=draft)


def crop(tmp_path: Path) -> Exercise:
    png = tmp_path / "c.png"
    png.write_bytes(b"png")
    return Exercise("books-batch1", {"id": "syt-p106-1", "page": 106, "gold": tab(BAR)}, png)


async def test_a_reading_s_replies_are_kept_and_played_back_without_the_model(
    tmp_path, monkeypatch
):
    provider = SimpleNamespace(model="m", name="bailian", small_model="m")
    calls: list[object] = []

    async def model_read(self, png, repair=None):  # noqa: ANN001
        calls.append(repair)
        return STRING_SIX, CallUsage(1000, 500, "m")

    monkeypatch.setattr(TabExtractor, "read", model_read)
    monkeypatch.setattr("evals.tab.run.cost_usd", lambda provider, usage: 0.01)
    ex = crop(tmp_path)
    reading = await read(provider, Validator(), ex)  # type: ignore[arg-type]
    assert reading["replies"] == [STRING_SIX.model_dump()] and reading["calls"] == 1
    assert len(calls) == 1

    played = await replay(provider, Validator(), ex, reading)  # type: ignore[arg-type]
    assert len(calls) == 1  # no model call
    assert played["draft"] == reading["draft"] and played["cached"] is True
    assert played["cost_usd"] == 0.01  # what the reading cost stays

    # Today's validator rejects the first draft: the repair was never read.
    short = await replay(provider, Validator(reject=1), ex, reading)  # type: ignore[arg-type]
    assert short["dropped"] is True
    assert short["warnings"][-1]["code"] == "REPLAY_SHORT"


async def test_a_repair_the_cache_lacks_is_read_live_when_resuming_and_only_it_is_paid(
    tmp_path, monkeypatch
):
    from tests.test_extract_tab import FIXED, OVERFULL

    provider = SimpleNamespace(model="m", name="bailian", small_model="m")
    calls: list[object] = []

    async def model_read(self, png, repair=None):  # noqa: ANN001
        calls.append(repair)
        return FIXED, CallUsage(1000, 500, "m")

    monkeypatch.setattr(TabExtractor, "read", model_read)
    monkeypatch.setattr("evals.tab.run.cost_usd", lambda provider, usage: 0.002)
    ex = crop(tmp_path)
    # Read before #464, when an overfull bar was not sent back: one reply.
    cached = {
        "replies": [OVERFULL.model_dump()],
        "calls": 1,
        "stop_reasons": ["end_turn"],
        "input_tokens": 5000,
        "output_tokens": 900,
        "cost_usd": 0.01,
        "seconds": 100.0,
    }

    free = await replay(provider, Validator(), ex, cached)  # type: ignore[arg-type]
    assert calls == [] and "resumed" not in free
    assert free["warnings"][-1]["code"] == "REPLAY_SHORT"
    assert [len(m["slots"]) for m in free["draft"]["measures"]] == [3, 1]

    resumed = await replay(provider, Validator(), ex, cached, resume=True)  # type: ignore[arg-type]
    assert len(calls) == 1 and calls[0] is not None  # the repair, and only it
    assert resumed["replies"] == [OVERFULL.model_dump(), FIXED.model_dump()]
    assert (resumed["calls"], resumed["cost_usd"], resumed["resumed"]) == (2, 0.012, 0.002)
    assert len(resumed["stop_reasons"]) == 2
    assert [len(m["slots"]) for m in resumed["draft"]["measures"]] == [2, 1]
