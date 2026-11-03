import { percentile } from "@/lib/evals/compare";
import type { EvalCase } from "@/lib/evals/types";

/**
 * The assistant eval's summary over the cases graded so far — the numbers
 * its row in `/dev/evals` shows while the run fills in. A case that passed
 * every repeat counts once in neither list; one that never passed is
 * `never`; one that passed some repeats is `flaky`.
 */
export function assistantSummary(cases: readonly EvalCase[]): Record<string, number> {
	if (cases.length === 0) return {};
	const byCase = new Map<string, { passed: number; total: number }>();
	for (const c of cases) {
		const tally = byCase.get(c.case) ?? { passed: 0, total: 0 };
		tally.total += 1;
		if (c.pass) tally.passed += 1;
		byCase.set(c.case, tally);
	}
	const tallies = [...byCase.values()];
	const sum = (key: string) => cases.reduce((s, c) => s + (c.metrics[key] ?? 0), 0);
	const latencies = cases.map((c) => c.metrics.latency_ms).filter((v): v is number => v !== undefined);
	const summary: Record<string, number> = {
		pass_rate: cases.filter((c) => c.pass).length / cases.length,
		never: tallies.filter((t) => t.passed === 0).length,
		flaky: tallies.filter((t) => t.passed > 0 && t.passed < t.total).length,
		cost_per_turn_usd: sum("cost_usd") / cases.length,
		calls_per_turn: sum("calls") / cases.length,
	};
	const p50 = percentile(latencies, 50);
	const p95 = percentile(latencies, 95);
	if (p50 !== undefined) summary.latency_p50_ms = p50;
	if (p95 !== undefined) summary.latency_p95_ms = p95;
	return summary;
}
