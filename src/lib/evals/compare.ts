import type { EvalMetric, EvalRunHeader, EvalSubject } from "@/lib/evals/types";

/** A value as the table prints it, by the metric's format. */
export function formatMetric(value: number | undefined, metric: EvalMetric): string {
	if (value === undefined || Number.isNaN(value)) return "—";
	switch (metric.format) {
		case "percent":
			return `${(value * 100).toFixed(1)}%`;
		case "usd":
			return value >= 0.01 ? `$${value.toFixed(3)}` : `$${value.toFixed(5)}`;
		case "fixed0":
			return Math.round(value).toLocaleString("en-US");
		case "fixed1":
			return value.toFixed(1);
		case "fixed2":
			return value.toFixed(2);
		case "ms":
			return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
		case "s":
			return `${value.toFixed(2)} s`;
	}
}

/** Whether `a` is better than `b` on this metric. */
export function isBetter(a: number, b: number, metric: EvalMetric): boolean {
	return metric.direction === "higher" ? a > b : a < b;
}

/** The best value among the subjects that have one, or undefined. */
export function bestValue(subjects: readonly EvalSubject[], metric: EvalMetric): number | undefined {
	let best: number | undefined;
	for (const s of subjects) {
		const v = s.summary[metric.key];
		if (v === undefined || Number.isNaN(v)) continue;
		if (best === undefined || isBetter(v, best, metric)) best = v;
	}
	return best;
}

export interface Delta {
	/** Current minus previous, in the metric's own units. */
	change: number;
	/** Coloured by whether the change is an improvement, not by its sign. */
	verdict: "better" | "worse" | "same";
}

/** How a value moved against the previous run of the same subject. */
export function deltaOf(current: number | undefined, previous: number | undefined, metric: EvalMetric): Delta | null {
	if (current === undefined || previous === undefined) return null;
	const change = current - previous;
	// Below the precision the table prints, a change is noise.
	const epsilon = metric.format === "percent" ? 0.0005 : Math.abs(previous) * 0.005;
	if (Math.abs(change) <= epsilon) return { change, verdict: "same" };
	return { change, verdict: isBetter(current, previous, metric) ? "better" : "worse" };
}

export function formatDelta(delta: Delta, metric: EvalMetric): string {
	const sign = delta.change > 0 ? "+" : delta.change < 0 ? "−" : "±";
	const magnitude = Math.abs(delta.change);
	if (metric.format === "percent") return `${sign}${(magnitude * 100).toFixed(1)} pp`;
	return `${sign}${formatMetric(magnitude, metric)}`;
}

export interface LeaderboardRow {
	subject: EvalSubject;
	/** The run this row's numbers come from: the subject's latest. */
	run: EvalRunHeader;
	/** The subject's summary in the run before that, if it has one. */
	previous?: { run: EvalRunHeader; summary: Record<string, number> };
}

const startedAt = (run: EvalRunHeader) => Date.parse(run.started_at ?? run.updated_at) || 0;

/**
 * One row per subject, from the newest run that has it; a subject seen in
 * several runs is compared with its run before. Rows keep the order the
 * newest run lists its subjects in, groups together.
 */
export function leaderboard(runs: readonly EvalRunHeader[]): LeaderboardRow[] {
	const newestFirst = [...runs].sort((a, b) => startedAt(b) - startedAt(a));
	const rows = new Map<string, LeaderboardRow>();
	for (const run of newestFirst) {
		for (const subject of run.subjects) {
			const row = rows.get(subject.id);
			if (!row) rows.set(subject.id, { subject, run });
			else if (!row.previous && Object.keys(subject.summary).length > 0)
				row.previous = { run, summary: subject.summary };
		}
	}
	const all = [...rows.values()];
	const groupOrder = [...new Set(all.map((r) => r.subject.group ?? ""))];
	return all.sort((a, b) => groupOrder.indexOf(a.subject.group ?? "") - groupOrder.indexOf(b.subject.group ?? ""));
}

/** Every metric the suite's runs define, newest definition winning, in first-seen order. */
export function suiteMetrics(runs: readonly EvalRunHeader[]): EvalMetric[] {
	const byKey = new Map<string, EvalMetric>();
	for (const run of [...runs].sort((a, b) => startedAt(a) - startedAt(b))) {
		for (const m of run.metrics) byKey.set(m.key, m);
	}
	return [...byKey.values()];
}

/**
 * The subjects no other subject beats on both metrics — the Pareto frontier
 * of a quality-vs-cost scatter — in order of `x`.
 */
export function paretoFrontier(
	subjects: readonly EvalSubject[],
	x: EvalMetric,
	y: EvalMetric,
): EvalSubject[] {
	const points = subjects.filter((s) => s.summary[x.key] !== undefined && s.summary[y.key] !== undefined);
	const atLeast = (a: number, b: number, m: EvalMetric) => a === b || isBetter(a, b, m);
	const frontier = points.filter(
		(p) =>
			!points.some(
				(q) =>
					q !== p &&
					atLeast(q.summary[x.key], p.summary[x.key], x) &&
					atLeast(q.summary[y.key], p.summary[y.key], y) &&
					(isBetter(q.summary[x.key], p.summary[x.key], x) || isBetter(q.summary[y.key], p.summary[y.key], y)),
			),
	);
	return frontier.sort((a, b) => a.summary[x.key] - b.summary[x.key]);
}

/** p-th percentile (0–100) of the values, by linear interpolation. */
export function percentile(values: readonly number[], p: number): number | undefined {
	if (values.length === 0) return undefined;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = (p / 100) * (sorted.length - 1);
	const lo = Math.floor(rank);
	const hi = Math.ceil(rank);
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/** The axis end above `value`: 1, 2, 2.5 or 5 times a power of ten (60 → 100, 49.99 → 50). */
export function niceMax(value: number): number {
	if (!(value > 0)) return 1;
	const power = 10 ** Math.floor(Math.log10(value));
	const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= value) ?? 10;
	return step * power;
}
