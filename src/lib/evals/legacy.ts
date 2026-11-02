import { percentile } from "@/lib/evals/compare";
import { ASSISTANT_METRICS, CHAPTER_QA_METRICS } from "@/lib/evals/suites";
import type { EvalCase, EvalRun, EvalSubject } from "@/lib/evals/types";

/**
 * The two baseline files written before the shared run shape (#370), read
 * as runs so their numbers sit in the same table as new ones. Both are
 * still written by their runners alongside the new run files.
 */

interface AssistantBaselineRun {
	id: string;
	run?: number;
	domain?: string;
	input?: string;
	toolsUsed?: string[];
	calls?: number;
	latencyMs?: number;
	costUsd?: number;
	pass: boolean;
	failures?: string[];
	text?: string;
	trace?: unknown;
}

interface AssistantBaselineModel {
	recordedAt: string;
	cases: number;
	repeats?: number;
	passRate: number;
	never?: string[];
	flaky?: string[];
	costPerTurnUsd?: number;
	callsPerTurn?: number;
	meanLatencyMs?: number;
	runs?: AssistantBaselineRun[];
}

export interface AssistantBaseline {
	models: Record<string, AssistantBaselineModel>;
}

/** The assistant eval's `baseline.json`: one run per model, as recorded. */
export function assistantBaselineRuns(baseline: AssistantBaseline): EvalRun[] {
	return Object.entries(baseline.models).map(([model, entry]) => {
		const runs = entry.runs ?? [];
		const latencies = runs.map((r) => r.latencyMs).filter((v): v is number => typeof v === "number");
		const summary: Record<string, number> = { pass_rate: entry.passRate };
		if (entry.never) summary.never = entry.never.length;
		if (entry.flaky) summary.flaky = entry.flaky.length;
		if (entry.costPerTurnUsd !== undefined) summary.cost_per_turn_usd = entry.costPerTurnUsd;
		if (entry.callsPerTurn !== undefined) summary.calls_per_turn = entry.callsPerTurn;
		const p50 = percentile(latencies, 50);
		const p95 = percentile(latencies, 95);
		if (p50 !== undefined) summary.latency_p50_ms = p50;
		if (p95 !== undefined) summary.latency_p95_ms = p95;
		const subject: EvalSubject = { id: model, label: model, status: "done", summary };
		const cases: EvalCase[] = runs.map((r) => ({
			subject: model,
			case: r.id,
			repeat: r.run,
			pass: r.pass,
			metrics: {
				...(r.latencyMs !== undefined ? { latency_ms: r.latencyMs } : {}),
				...(r.costUsd !== undefined ? { cost_usd: r.costUsd } : {}),
				...(r.calls !== undefined ? { calls: r.calls } : {}),
			},
			failures: r.failures ?? [],
			detail: { domain: r.domain, input: r.input, tools_used: r.toolsUsed, reply: r.text, trace: r.trace },
		}));
		return {
			suite: "assistant",
			title: "General assistant eval",
			run_id: `baseline-${model}`,
			status: "done",
			started_at: entry.recordedAt,
			finished_at: entry.recordedAt,
			config: { repeats: entry.repeats ?? 1, cases: entry.cases },
			metrics: ASSISTANT_METRICS,
			subjects: [subject],
			cases,
		};
	});
}

/** "7/7" → 1, "—" → undefined. */
function fraction(text: unknown): number | undefined {
	if (typeof text !== "string") return undefined;
	const m = /^(\d+)\/(\d+)$/.exec(text.trim());
	if (!m || Number(m[2]) === 0) return undefined;
	return Number(m[1]) / Number(m[2]);
}

export type ChapterQaBaseline = Record<string, Record<string, unknown>>;

/**
 * The Q&A eval's `baseline-sample.json`: summaries only, keyed
 * `provider:fixture`, no dates. One run, dated by the file.
 */
export function chapterQaBaselineRun(baseline: ChapterQaBaseline, recordedAt: string): EvalRun {
	const subjects: EvalSubject[] = Object.entries(baseline).map(([key, row]) => {
		const [provider, fixture] = key.split(":");
		const summary: Record<string, number> = {};
		for (const metric of ["routing", "page_recall", "faithfulness", "draft", "injection"]) {
			const v = fraction(row[metric]);
			if (v !== undefined) summary[metric] = v;
		}
		for (const metric of ["cold_usd", "warm_usd", "usd_total", "latency_p50_s"]) {
			const v = row[metric];
			if (typeof v === "number") summary[metric] = v;
		}
		const model = typeof row.model === "string" ? row.model : provider;
		return { id: key, label: fixture ?? key, group: model, status: "done", summary };
	});
	return {
		suite: "chapter-qa",
		title: "Chapter Q&A on exported chapters",
		run_id: "baseline-sample",
		status: "done",
		started_at: recordedAt,
		finished_at: recordedAt,
		metrics: CHAPTER_QA_METRICS,
		subjects,
		cases: [],
	};
}
