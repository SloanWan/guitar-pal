"use client";

import { formatMetric, isBetter, niceMax } from "@/lib/evals/compare";
import type { EvalMetric, EvalSubject } from "@/lib/evals/types";

const W = 760;
const LABEL_W = 300;
const VALUE_W = 86;
const ROW_H = 24;
const BAR_H = 14;
const TOP = 22;

/**
 * One metric, one horizontal bar per subject, best first. Bars start at
 * zero; a rate's axis runs to 100%. The subject that is today's practice is
 * hatched grey, the best is solid denim, the rest light denim — every value
 * is printed, so colour only says which is which.
 */
export default function MetricBars({ subjects, metric, today }: { subjects: EvalSubject[]; metric: EvalMetric; today?: string }) {
	const rows = subjects
		.filter((s) => s.summary[metric.key] !== undefined)
		.sort((a, b) => (isBetter(a.summary[metric.key], b.summary[metric.key], metric) ? -1 : 1));
	if (rows.length === 0) return <p className="m-0 text-[12.5px] text-gp-ink-3">No values for {metric.label} yet.</p>;

	const max = metric.format === "percent" ? 1 : niceMax(Math.max(...rows.map((s) => s.summary[metric.key])));
	const barW = W - LABEL_W - VALUE_W;
	const x = (v: number) => LABEL_W + (Math.max(0, v) / max) * barW;
	// Quarters on a rate or a round time axis; halves on a count, so ticks stay whole.
	const ticks =
		metric.format === "percent" ? [0, 0.25, 0.5, 0.75, 1] : metric.format === "fixed0" ? [0, max / 2, max] : [0, max / 4, max / 2, (3 * max) / 4, max];
	const H = TOP + rows.length * ROW_H + 8;
	const best = rows[0].summary[metric.key];

	return (
		<div className="overflow-x-auto">
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="block h-auto w-full max-w-[760px] min-w-130 text-gp-ink"
				role="img"
				aria-label={`${metric.label} by subject, best first`}
			>
				<defs>
					<pattern id={`hatch-${metric.key}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
						<rect width="6" height="6" className="fill-gp-line" />
						<line x1="0" y1="0" x2="0" y2="6" strokeWidth="3" className="stroke-gp-ink-3" />
					</pattern>
				</defs>
				{ticks.map((t) => (
					<g key={t}>
						<line x1={x(t)} x2={x(t)} y1={TOP - 4} y2={H - 6} className="stroke-gp-line" />
						<text x={x(t)} y={TOP - 8} textAnchor="middle" className="fill-gp-ink-3 font-mono text-[10px]">
							{formatMetric(t, metric)}
						</text>
					</g>
				))}
				{rows.map((s, i) => {
					const v = s.summary[metric.key];
					const y = TOP + i * ROW_H + (ROW_H - BAR_H) / 2;
					const isToday = s.id === today;
					const isBest = v === best;
					const fill = isToday ? `url(#hatch-${metric.key})` : undefined;
					const cls = isToday ? "" : isBest ? "fill-gp-tab-500" : "fill-gp-tab-300";
					return (
						<g key={s.id}>
							<title>{`${s.label}: ${formatMetric(v, metric)}${isToday ? " (today)" : ""}`}</title>
							<text x={LABEL_W - 10} y={y + BAR_H - 3} textAnchor="end" className={`text-[11.5px] ${isToday ? "fill-gp-ink-2" : "fill-gp-ink"}`}>
								{s.label.length > 46 ? `${s.label.slice(0, 45)}…` : s.label}
								{isToday ? " ·今" : ""}
							</text>
							<rect x={LABEL_W} y={y} width={Math.max(1, x(v) - LABEL_W)} height={BAR_H} rx={3} className={cls} fill={fill} />
							<text x={x(v) + 6} y={y + BAR_H - 3} className={`font-mono text-[11px] ${isBest ? "fill-gp-ink font-bold" : "fill-gp-ink-2"}`}>
								{formatMetric(v, metric)}
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
}
