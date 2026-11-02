"use client";

import { formatMetric, niceMax } from "@/lib/evals/compare";
import type { EvalMetric, EvalSubject } from "@/lib/evals/types";

const W = 760;
const LABEL_W = 180;
const VALUE_W = 70;
const BAR_H = 12;
const GAP = 3;
const GROUP_GAP = 14;
const TOP = 46;

/** Grey for today's practice, then light and full denim: an ordered "before → after". */
const FILLS = ["fill-gp-ink-3", "fill-gp-tab-300", "fill-gp-tab-500"];
const SWATCH = ["bg-gp-ink-3", "bg-gp-tab-300", "bg-gp-tab-500"];

/**
 * One metric per group (a book), a bar per subject inside each group, so a
 * difference that lives in one kind of book shows as one. Subjects are
 * drawn in the order given — meant as before → after.
 */
export default function GroupBars({
	subjects,
	metric,
	groupNames,
}: {
	subjects: EvalSubject[];
	metric: EvalMetric;
	groupNames?: Record<string, string>;
}) {
	const withData = subjects.filter((s) => s.breakdown && Object.keys(s.breakdown).length > 0);
	if (withData.length === 0) return <p className="m-0 text-[12.5px] text-gp-ink-3">No per-group numbers in these runs yet.</p>;
	const groups = [...new Set(withData.flatMap((s) => Object.keys(s.breakdown ?? {})))];
	const max =
		metric.format === "percent" ? 1 : niceMax(Math.max(...withData.flatMap((s) => Object.values(s.breakdown ?? {}).map((b) => b[metric.key] ?? 0))));
	const barW = W - LABEL_W - VALUE_W;
	const groupH = withData.length * (BAR_H + GAP) - GAP;
	const H = TOP + groups.length * (groupH + GROUP_GAP);
	const x = (v: number) => LABEL_W + (Math.max(0, v) / max) * barW;
	const ticks = metric.format === "percent" ? [0, 0.5, 1] : [0, max];

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-gp-ink-2" aria-hidden>
				{withData.map((s, i) => (
					<span key={s.id} className="inline-flex items-center gap-1.5">
						<span className={`inline-block size-2.5 rounded-sm ${SWATCH[i % SWATCH.length]}`} />
						{s.label}
					</span>
				))}
			</div>
			<div className="overflow-x-auto">
				<svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[760px] min-w-130 text-gp-ink" role="img" aria-label={`${metric.label} per group, one bar per subject`}>
					{ticks.map((t) => (
						<g key={t}>
							<line x1={x(t)} x2={x(t)} y1={TOP - 14} y2={H} className="stroke-gp-line" />
							<text x={x(t)} y={TOP - 20} textAnchor="middle" className="fill-gp-ink-3 font-mono text-[10px]">
								{formatMetric(t, metric)}
							</text>
						</g>
					))}
					{groups.map((g, gi) => {
						const y0 = TOP + gi * (groupH + GROUP_GAP);
						return (
							<g key={g}>
								<text x={LABEL_W - 10} y={y0 + groupH / 2 + 4} textAnchor="end" className="fill-gp-ink text-[11.5px]">
									{groupNames?.[g] ?? g}
								</text>
								{withData.map((s, i) => {
									const v = s.breakdown?.[g]?.[metric.key];
									if (v === undefined) return null;
									const y = y0 + i * (BAR_H + GAP);
									return (
										<g key={s.id}>
											<title>{`${groupNames?.[g] ?? g} · ${s.label}: ${formatMetric(v, metric)}`}</title>
											<rect x={LABEL_W} y={y} width={Math.max(1, x(v) - LABEL_W)} height={BAR_H} rx={2} className={FILLS[i % FILLS.length]} />
											<text x={x(v) + 5} y={y + BAR_H - 2} className="fill-gp-ink-2 font-mono text-[10.5px]">
												{formatMetric(v, metric)}
											</text>
										</g>
									);
								})}
							</g>
						);
					})}
				</svg>
			</div>
		</div>
	);
}
