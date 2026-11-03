import { describe, expect, it } from "vitest";

import { assistantSummary } from "@/lib/evals/assistantSummary";
import { bestValue, deltaOf, formatDelta, formatMetric, leaderboard, paretoFrontier, percentile, suiteMetrics } from "@/lib/evals/compare";
import { assistantBaselineRuns, chapterQaBaselineRun } from "@/lib/evals/legacy";
import type { EvalCase, EvalMetric, EvalRunHeader, EvalSubject } from "@/lib/evals/types";

const CER: EvalMetric = { key: "cer", label: "CER", direction: "lower", format: "percent" };
const RECALL: EvalMetric = { key: "recall", label: "Recall", direction: "higher", format: "percent" };
const SPEED: EvalMetric = { key: "s", label: "s/page", direction: "lower", format: "s" };

const subject = (id: string, summary: Record<string, number>, group?: string): EvalSubject => ({ id, label: id, group, summary });

function run(id: string, startedAt: string, subjects: EvalSubject[]): EvalRunHeader {
	return {
		suite: "ocr",
		title: "t",
		run_id: id,
		status: "done",
		started_at: startedAt,
		finished_at: startedAt,
		metrics: [CER],
		subjects,
		updated_at: startedAt,
		case_count: 0,
	};
}

describe("formatMetric", () => {
	it("prints each format", () => {
		expect(formatMetric(0.1234, CER)).toBe("12.3%");
		expect(formatMetric(0.0055, { ...CER, format: "usd" })).toBe("$0.00550");
		expect(formatMetric(0.1047, { ...CER, format: "usd" })).toBe("$0.105");
		expect(formatMetric(5861, { ...CER, format: "ms" })).toBe("5.9 s");
		expect(formatMetric(840, { ...CER, format: "ms" })).toBe("840 ms");
		expect(formatMetric(undefined, CER)).toBe("—");
	});
});

describe("best values and deltas follow the metric's direction", () => {
	const subjects = [subject("a", { cer: 0.2, recall: 0.8 }), subject("b", { cer: 0.1, recall: 0.7 }), subject("c", {})];

	it("picks the lowest CER and the highest recall", () => {
		expect(bestValue(subjects, CER)).toBe(0.1);
		expect(bestValue(subjects, RECALL)).toBe(0.8);
		expect(bestValue([subject("c", {})], CER)).toBeUndefined();
	});

	it("calls a falling CER better and a falling recall worse", () => {
		expect(deltaOf(0.1, 0.2, CER)?.verdict).toBe("better");
		expect(deltaOf(0.7, 0.8, RECALL)?.verdict).toBe("worse");
		expect(deltaOf(0.5, 0.5002, CER)?.verdict).toBe("same");
		expect(deltaOf(0.5, undefined, CER)).toBeNull();
	});

	it("writes percentage-point deltas with a real minus sign", () => {
		expect(formatDelta({ change: -0.05, verdict: "better" }, CER)).toBe("−5.0 pp");
		expect(formatDelta({ change: 0.5, verdict: "worse" }, SPEED)).toBe("+0.50 s");
	});
});

describe("leaderboard", () => {
	it("takes each subject from its newest run and compares it with the run before", () => {
		const older = run("r1", "2026-10-01T00:00:00Z", [subject("tess", { cer: 0.3 }), subject("pp", { cer: 0.1 })]);
		const newer = run("r2", "2026-10-02T00:00:00Z", [subject("tess", { cer: 0.25 })]);
		const rows = leaderboard([older, newer]);
		expect(rows.map((r) => [r.subject.id, r.run.run_id, r.previous?.run.run_id])).toEqual([
			["tess", "r2", "r1"],
			["pp", "r1", undefined],
		]);
	});

	it("keeps groups together", () => {
		const r = run("r", "2026-10-01T00:00:00Z", [subject("a", {}, "x"), subject("b", {}, "y"), subject("c", {}, "x")]);
		expect(leaderboard([r]).map((row) => row.subject.id)).toEqual(["a", "c", "b"]);
	});

	it("collects every metric the runs define", () => {
		const a = { ...run("a", "2026-10-01T00:00:00Z", []), metrics: [CER] };
		const b = { ...run("b", "2026-10-02T00:00:00Z", []), metrics: [RECALL, { ...CER, label: "CER (new)" }] };
		expect(suiteMetrics([a, b]).map((m) => m.label)).toEqual(["CER (new)", "Recall"]);
	});
});

describe("paretoFrontier", () => {
	it("keeps the subjects nothing beats on both axes", () => {
		const subjects = [
			subject("fast-bad", { s: 1, recall: 0.6 }),
			subject("slow-good", { s: 5, recall: 0.95 }),
			subject("dominated", { s: 6, recall: 0.9 }),
			subject("middle", { s: 2, recall: 0.85 }),
		];
		expect(paretoFrontier(subjects, SPEED, RECALL).map((s) => s.id)).toEqual(["fast-bad", "middle", "slow-good"]);
	});
});

describe("percentile", () => {
	it("interpolates", () => {
		expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
		expect(percentile([10], 95)).toBe(10);
		expect(percentile([], 50)).toBeUndefined();
	});
});

describe("assistantSummary", () => {
	const c = (id: string, pass: boolean, latency: number): EvalCase => ({
		subject: "m",
		case: id,
		pass,
		metrics: { latency_ms: latency, cost_usd: 0.01, calls: 2 },
	});

	it("separates never-passed from flaky cases", () => {
		const summary = assistantSummary([c("a", true, 100), c("a", true, 200), c("b", false, 300), c("b", false, 400), c("x", true, 100), c("x", false, 100)]);
		expect(summary.pass_rate).toBeCloseTo(3 / 6);
		expect(summary.never).toBe(1);
		expect(summary.flaky).toBe(1);
		expect(summary.cost_per_turn_usd).toBeCloseTo(0.01);
		expect(summary.calls_per_turn).toBe(2);
		expect(summary.latency_p50_ms).toBe(150);
	});

	it("is empty before any case", () => {
		expect(assistantSummary([])).toEqual({});
	});
});

describe("legacy baselines", () => {
	it("reads the assistant baseline as one run per model", () => {
		const runs = assistantBaselineRuns({
			models: {
				"deepseek-flash": {
					recordedAt: "2026-09-25T14:56:28.809Z",
					cases: 2,
					repeats: 1,
					passRate: 0.5,
					never: ["b"],
					flaky: [],
					costPerTurnUsd: 0.0006,
					callsPerTurn: 2,
					runs: [
						{ id: "a", run: 1, pass: true, latencyMs: 100, costUsd: 0.0006, calls: 2 },
						{ id: "b", run: 1, pass: false, latencyMs: 300, failures: ["no card"] },
					],
				},
			},
		});
		expect(runs).toHaveLength(1);
		expect(runs[0].subjects[0].summary).toMatchObject({ pass_rate: 0.5, never: 1, flaky: 0, latency_p50_ms: 200 });
		expect(runs[0].cases[1]).toMatchObject({ case: "b", pass: false, failures: ["no card"] });
	});

	it("reads the Q&A baseline's fractions as rates and skips the dashes", () => {
		const run = chapterQaBaselineRun(
			{ "deepseek:syt-ch1": { model: "deepseek-flash", routing: "14/14", draft: "—", faithfulness: "8/10", usd_total: 0.0106 } },
			"2026-09-25T00:00:00Z",
		);
		expect(run.subjects[0]).toMatchObject({ id: "deepseek:syt-ch1", label: "syt-ch1", group: "deepseek-flash" });
		expect(run.subjects[0].summary).toEqual({ routing: 1, faithfulness: 0.8, usd_total: 0.0106 });
	});
});

describe("niceMax", () => {
	it("rounds an axis end up to a round number", async () => {
		const { niceMax } = await import("@/lib/evals/compare");
		expect(niceMax(49.99)).toBe(50);
		expect(niceMax(0.6)).toBe(1);
		expect(niceMax(14)).toBe(20);
		expect(niceMax(0)).toBe(1);
	});
});
