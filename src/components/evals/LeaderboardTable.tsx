"use client";

import { bestValue, deltaOf, formatDelta, formatMetric, type LeaderboardRow } from "@/lib/evals/compare";
import type { EvalMetric } from "@/lib/evals/types";

import { StatusPill } from "./evalUi";

interface Props {
	rows: LeaderboardRow[];
	metrics: EvalMetric[];
	selectedRunId: string | null;
	onSelectRun: (runId: string) => void;
}

/**
 * One row per subject from its newest run. Every header says which way is
 * better; the best value per column is bold; under each value, the change
 * since that subject's run before, coloured by whether it got better.
 */
export default function LeaderboardTable({ rows, metrics, selectedRunId, onSelectRun }: Props) {
	const subjects = rows.map((r) => r.subject);
	const best = new Map(metrics.map((m) => [m.key, bestValue(subjects, m)]));

	return (
		<div className="overflow-x-auto rounded-md border border-gp-line bg-gp-card">
			<table className="w-full border-collapse text-[13px]">
				<thead>
					<tr className="border-b border-gp-line text-left font-mono text-[10.5px] uppercase tracking-[0.06em] text-gp-ink-3">
						<th className="sticky left-0 z-10 bg-gp-card px-3 py-2 font-normal">Subject</th>
						{metrics.map((m) => (
							<th key={m.key} className="whitespace-nowrap px-3 py-2 text-right font-normal" title={m.description}>
								{m.label} <span aria-label={m.direction === "higher" ? "higher is better" : "lower is better"}>{m.direction === "higher" ? "↑" : "↓"}</span>
							</th>
						))}
						<th className="px-3 py-2 font-normal">Run</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row, i) => {
						const group = row.subject.group;
						const showGroup = group !== undefined && (i === 0 || rows[i - 1].subject.group !== group);
						return [
							showGroup ? (
								<tr key={`g-${group}`} className="border-b border-gp-line bg-gp-page">
									<td colSpan={metrics.length + 2} className="px-3 py-1.5 font-mono text-[11px] text-gp-ink-2">
										{group}
									</td>
								</tr>
							) : null,
							<tr key={row.subject.id} className="border-b border-gp-line last:border-b-0">
								<td className="sticky left-0 z-10 bg-gp-card px-3 py-2 align-top">
									<div className="flex flex-wrap items-center gap-2">
										<span className="whitespace-nowrap font-medium text-gp-ink">{row.subject.label}</span>
										{row.subject.status && row.subject.status !== "done" && <StatusPill status={row.subject.status} />}
									</div>
									{row.subject.error && <div className="mt-0.5 text-[11.5px] text-gp-bad">{row.subject.error}</div>}
									{row.subject.notes && <div className="mt-0.5 text-[11.5px] text-gp-ink-3">{row.subject.notes}</div>}
								</td>
								{metrics.map((m) => {
									const value = row.subject.summary[m.key];
									const isBest = value !== undefined && value === best.get(m.key) && rows.length > 1;
									const delta = deltaOf(value, row.previous?.summary[m.key], m);
									return (
										<td key={m.key} className="whitespace-nowrap px-3 py-2 text-right align-top font-mono tabular-nums">
											<div className={isBest ? "font-bold text-gp-ink" : "text-gp-ink-2"}>{formatMetric(value, m)}</div>
											{delta && delta.verdict !== "same" && (
												<div
													className={`text-[10.5px] ${delta.verdict === "better" ? "text-gp-tab-500" : "text-gp-bad"}`}
													title={`vs ${row.previous?.run.run_id}`}
												>
													{formatDelta(delta, m)}
												</div>
											)}
										</td>
									);
								})}
								<td className="whitespace-nowrap px-3 py-2 align-top">
									<button
										type="button"
										onClick={() => onSelectRun(row.run.run_id)}
										className={`font-mono text-[11px] underline-offset-2 hover:underline ${row.run.run_id === selectedRunId ? "text-gp-tab-500" : "text-gp-ink-3"}`}
									>
										{row.run.run_id}
									</button>
								</td>
							</tr>,
						];
					})}
				</tbody>
			</table>
		</div>
	);
}
