"use client";

import { useMemo, useState } from "react";

import { formatMetric } from "@/lib/evals/compare";
import type { EvalCase, EvalMetric, EvalRun } from "@/lib/evals/types";

type Filter = "all" | "failures" | "flaky" | "different" | "errors";

const FILTERS: { id: Filter; label: string; hint: string }[] = [
	{ id: "all", label: "All", hint: "Every case." },
	{ id: "failures", label: "Failures", hint: "A repeat failed, or the case scored worst in its row." },
	{ id: "flaky", label: "Flaky", hint: "Passed some repeats and failed others." },
	{ id: "different", label: "Different", hint: "Subjects disagree: one passed where another failed." },
	{ id: "errors", label: "Errors", hint: "The attempt could not be graded (a crash, a judge that did not answer)." },
];

interface Props {
	run: EvalRun;
	/** For suites graded by numbers (OCR): the metric each cell shows. */
	cellMetric?: EvalMetric;
	selected: EvalCase | null;
	onSelect: (c: EvalCase) => void;
}

/**
 * Cases down, subjects across. A pass/fail cell is one dot per repeat; a
 * numeric cell is the case's value, shaded by how far it falls behind the row's best.
 * The filters narrow the rows to the ones worth reading.
 */
export default function CaseMatrix({ run, cellMetric, selected, onSelect }: Props) {
	const [filter, setFilter] = useState<Filter>("all");
	const subjects = run.subjects;

	const rows = useMemo(() => {
		const byCase = new Map<string, Map<string, EvalCase[]>>();
		for (const c of run.cases) {
			const row = byCase.get(c.case) ?? new Map<string, EvalCase[]>();
			row.set(c.subject, [...(row.get(c.subject) ?? []), c]);
			byCase.set(c.case, row);
		}
		return [...byCase.entries()].map(([id, cells]) => ({ id, cells }));
	}, [run.cases]);

	const graded = run.cases.some((c) => c.pass !== undefined);

	const keep = (cells: Map<string, EvalCase[]>): boolean => {
		const all = [...cells.values()].flat();
		switch (filter) {
			case "all":
				return true;
			case "errors":
				return all.some((c) => c.error);
			case "failures":
				if (graded) return all.some((c) => c.pass === false);
				return all.some((c) => c.error) || worstCellIsBad(cells, cellMetric);
			case "flaky":
				return [...cells.values()].some((cs) => cs.some((c) => c.pass) && cs.some((c) => c.pass === false));
			case "different": {
				if (graded) {
					const verdicts = [...cells.values()].map((cs) => cs.every((c) => c.pass));
					return new Set(verdicts).size > 1;
				}
				return spread(cells, cellMetric) > 0.1;
			}
		}
	};

	const visible = rows.filter((r) => keep(r.cells));

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter cases">
				{FILTERS.filter((f) => graded || (f.id !== "flaky")).map((f) => (
					<button
						key={f.id}
						type="button"
						title={f.hint}
						aria-pressed={filter === f.id}
						onClick={() => setFilter(f.id)}
						className={`rounded-full border px-2.5 py-0.5 text-[12px] transition-colors duration-(--dur-hover) ${
							filter === f.id ? "border-gp-tab-500 bg-gp-tab-100 text-gp-tab-500" : "border-gp-line text-gp-ink-2 hover:text-gp-ink"
						}`}
					>
						{f.label}
					</button>
				))}
				<span className="ml-1 font-mono text-[11px] text-gp-ink-3">
					{visible.length}/{rows.length} cases
				</span>
			</div>
			<div className="max-h-[520px] overflow-auto rounded-md border border-gp-line bg-gp-card">
				<table className="w-full border-collapse text-[12.5px]">
					<thead className="sticky top-0 z-10 bg-gp-card">
						<tr className="border-b border-gp-line text-left font-mono text-[10.5px] uppercase tracking-[0.06em] text-gp-ink-3">
							<th className="px-3 py-2 font-normal">Case</th>
							{subjects.map((s) => (
								<th key={s.id} className="whitespace-nowrap px-3 py-2 text-center font-normal">
									{s.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{visible.map((row) => (
							<tr key={row.id} className="border-b border-gp-line last:border-b-0">
								<td className="max-w-[280px] truncate px-3 py-1.5 font-mono text-[11.5px] text-gp-ink-2" title={row.id}>
									{row.id}
								</td>
								{subjects.map((s) => {
									const cs = row.cells.get(s.id) ?? [];
									return (
										<td key={s.id} className="px-3 py-1.5 text-center">
											{cs.length === 0 ? (
												<span className="text-gp-ink-3">·</span>
											) : graded ? (
												<span className="inline-flex gap-1">
													{cs.map((c) => (
														<button
															key={c.repeat ?? 0}
															type="button"
															onClick={() => onSelect(c)}
															aria-label={`${row.id} ${s.label}${c.repeat ? ` repeat ${c.repeat}` : ""}: ${c.error ? "error" : c.pass ? "pass" : "fail"}`}
															className={`size-3 rounded-full border ${
																c.error
																	? "border-gp-ink-3 bg-transparent"
																	: c.pass
																		? "border-gp-tab-500 bg-gp-tab-500"
																		: "border-gp-bad bg-gp-bad"
															} ${selected === c ? "ring-2 ring-gp-ink ring-offset-1 ring-offset-gp-card" : ""}`}
														/>
													))}
												</span>
											) : (
												<NumericCell cases={cs} row={row.cells} metric={cellMetric} selected={selected} onSelect={onSelect} />
											)}
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function rowValues(cells: Map<string, EvalCase[]>, metric: EvalMetric | undefined): number[] {
	if (!metric) return [];
	return [...cells.values()]
		.flat()
		.map((c) => c.metrics[metric.key])
		.filter((v): v is number => v !== undefined);
}

function spread(cells: Map<string, EvalCase[]>, metric: EvalMetric | undefined): number {
	const values = rowValues(cells, metric);
	return values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
}

/** For numeric suites: the row's worst value is meaningfully bad (over a quarter wrong). */
function worstCellIsBad(cells: Map<string, EvalCase[]>, metric: EvalMetric | undefined): boolean {
	const values = rowValues(cells, metric);
	if (!metric || values.length === 0) return false;
	const worst = metric.direction === "lower" ? Math.max(...values) : Math.min(...values);
	return metric.direction === "lower" ? worst > 0.25 : worst < 0.75;
}

function NumericCell({
	cases,
	row,
	metric,
	selected,
	onSelect,
}: {
	cases: EvalCase[];
	row: Map<string, EvalCase[]>;
	metric: EvalMetric | undefined;
	selected: EvalCase | null;
	onSelect: (c: EvalCase) => void;
}) {
	const c = cases[0];
	const value = metric ? c.metrics[metric.key] : undefined;
	const values = rowValues(row, metric);
	let shade = 0;
	if (metric && value !== undefined && values.length > 1) {
		const best = metric.direction === "lower" ? Math.min(...values) : Math.max(...values);
		// A fixed span, not the row's own range: two engines a tenth of a point
		// apart are not best and worst, they are the same.
		const span = metric.format === "percent" ? 0.2 : Math.abs(best) || 1;
		shade = Math.min(1, Math.abs(value - best) / span);
	}
	return (
		<button
			type="button"
			onClick={() => onSelect(c)}
			className={`w-full rounded px-1.5 py-0.5 font-mono text-[11.5px] tabular-nums ${
				c.error ? "text-gp-bad" : "text-gp-ink"
			} ${selected === c ? "ring-2 ring-gp-ink" : ""}`}
			style={
				c.error || value === undefined
					? undefined
					: { backgroundColor: `color-mix(in oklab, var(--gp-bad) ${Math.round(shade * 28)}%, color-mix(in oklab, var(--gp-tab-500) ${Math.round((1 - shade) * 18)}%, transparent))` }
			}
		>
			{c.error ? c.error : metric ? formatMetric(value, metric) : "—"}
		</button>
	);
}
