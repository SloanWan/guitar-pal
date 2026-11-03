import pytest

from app.ask.provider import bailian_provider
from app.ingest.model import CallUsage
from evals.classify.run import CNY_PER_USD, cost_usd, subject_summary
from evals.classify.score import score_page


def test_bailian_calls_are_priced_in_yuan_and_reported_in_dollars():
    provider = bailian_provider("k", "qwen3-vl-plus")
    usage = [CallUsage(2_000, 300, "qwen3-vl-plus"), CallUsage(1_000, 0, "qwen3-vl-plus")]
    # ¥1 in, ¥10 out per million tokens.
    assert cost_usd(provider, usage) == pytest.approx((3_000 * 1 + 300 * 10) / 1e6 / CNY_PER_USD)


def test_a_bailian_model_without_a_price_is_refused_before_it_spends():
    with pytest.raises(SystemExit):
        cost_usd(bailian_provider("k", "unpriced"), [CallUsage(1, 1, "unpriced")])


def test_the_summary_counts_unanswered_pages_and_averages_cost_over_answers():
    record = {"kind": "tab", "notation": ["tab"], "exercises": 2}
    verdicts = [
        {"kind": "tab", "regions": [], "cost_usd": 0.002, "seconds": 3.0},
        {"kind": "other", "regions": [], "unanswered": True, "cost_usd": 0.004, "seconds": 5.0},
        {"error": "BadRequestError: 400"},
    ]
    scores = [score_page(record, v["kind"], v["regions"]) for v in verdicts[:2]]
    s = subject_summary(scores, verdicts)
    assert s["unanswered"] == 1
    assert s["missed_exercises"] == 2
    assert s["cost_per_page_usd"] == pytest.approx(0.003)
    assert s["seconds_per_page"] == pytest.approx(4.0)
