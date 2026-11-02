"use client";

import { formatMetric, paretoFrontier } from "@/lib/evals/compare";
import type { EvalMetric, EvalSubject } from "@/lib/evals/types";

interface Props {
	subjects: EvalSubject[];
	x: EvalMetric;
	y: EvalMetric;
	/** The English caption under the chart; off where notes sit beside it. */
	caption?: boolean;
}

const W = 700;
const H = 340;
const PAD = { left: 64, right: 24, top: 18, bottom: 42 };
/** Rough width of a label at 10.5px, for keeping labels off each other. */
const LABEL_CHAR_PX = 6.4;

/** Four round ticks covering [lo, hi]. */
function ticks(lo: number, hi: number): number[] {
	if (lo === hi) return [lo];
	const step = (hi - lo) / 4;
	return [0, 1, 2, 3, 4].map((i) => lo + step * i);
}

/**
 * Quality against cost or time, one point per subject, values printed on
 * the points. The y axis is turned so better is always up; the corner that
 * is better on both is marked, and the frontier joins the subjects nothing
 * beats on both.
 */
export default function ScatterPlot({ subjects, x, y, caption = true }: Props) {
	const points = subjects.filter((s) => s.summary[x.key] !== undefined && s.summary[y.key] !== undefined);
	if (points.length < 2) return null;

	const xs = points.map((s) => s.summary[x.key]);
	const ys = points.map((s) => s.summary[y.key]);
	// A rate never runs past 100%, and nothing here goes below zero.
	const pad = (lo: number, hi: number, percent: boolean) => {
		const span = hi - lo || Math.abs(hi) || 1;
		const top = hi + span * 0.12;
		return [Math.max(0, lo - span * 0.12), percent ? Math.min(1, top) : top] as const;
	};
	const [x0, x1] = pad(Math.min(...xs), Math.max(...xs), x.format === "percent");
	const [y0, y1] = pad(Math.min(...ys), Math.max(...ys), y.format === "percent");
	const px = (v: number) => PAD.left + ((v - x0) / (x1 - x0)) * (W - PAD.left - PAD.right);
	// Better is up: a higher-is-better y grows upward, a lower-is-better one downward.
	const py = (v: number) => {
		const t = (v - y0) / (y1 - y0);
		const up = y.direction === "higher" ? t : 1 - t;
		return H - PAD.bottom - up * (H - PAD.top - PAD.bottom);
	};
	const frontier = paretoFrontier(points, x, y);
	const betterLeft = x.direction === "lower";

	// Labels go above-right of their point, else below, else left out (the
	// point keeps its tooltip): crowded points stay readable.
	const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
	const labels = new Map<string, { x: number; y: number; anchor: "start" | "end" } | null>();
	const clear = (box: (typeof placed)[number]) =>
		!placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
	for (const s of [...points].sort((a, b) => Number(frontier.includes(b)) - Number(frontier.includes(a)))) {
		const cx = px(s.summary[x.key]);
		const cy = py(s.summary[y.key]);
		const width = (s.label.length + formatMetric(s.summary[y.key], y).length + 1) * LABEL_CHAR_PX;
		const right = cx + 9 + width < W - PAD.right;
		const lx = right ? cx + 9 : cx - 9;
		const [bx0, bx1] = right ? [lx, lx + width] : [lx - width, lx];
		const spot = [cy - 7, cy + 16].map((ly) => ({ x0: bx0, x1: bx1, y0: ly - 11, y1: ly + 2, ly })).find(clear);
		if (spot) placed.push(spot);
		labels.set(s.id, spot ? { x: lx, y: spot.ly, anchor: right ? "start" : "end" } : null);
	}

	return (
		<figure className="m-0 flex flex-col gap-2">
			<div className="overflow-x-auto rounded-md border border-gp-line bg-gp-card p-2">
				<svg
					viewBox={`0 0 ${W} ${H}`}
					className="block h-auto w-full max-w-[700px] min-w-130 text-gp-ink"
					role="img"
					aria-label={`${y.label} against ${x.label}, one point per subject`}
				>
					<rect
						x={betterLeft ? PAD.left : (W - PAD.right + PAD.left) / 2}
						y={PAD.top}
						width={(W - PAD.left - PAD.right) / 2}
						height={(H - PAD.top - PAD.bottom) / 2}
						className="fill-gp-tab-100"
					/>
					<text
						x={betterLeft ? PAD.left + 6 : W - PAD.right - 6}
						y={(H - PAD.bottom + PAD.top) / 2 - 6}
						textAnchor={betterLeft ? "start" : "end"}
						className="fill-gp-tab-500 font-mono text-[10px]"
					>
						better on both
					</text>
					{ticks(x0, x1).map((t) => (
						<g key={`x${t}`}>
							<line x1={px(t)} x2={px(t)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-gp-line" />
							<text x={px(t)} y={H - PAD.bottom + 16} textAnchor="middle" className="fill-gp-ink-3 font-mono text-[10px]">
								{formatMetric(t, x)}
							</text>
						</g>
					))}
					{ticks(y0, y1).map((t) => (
						<g key={`y${t}`}>
							<line x1={PAD.left} x2={W - PAD.right} y1={py(t)} y2={py(t)} className="stroke-gp-line" />
							<text x={PAD.left - 8} y={py(t) + 3} textAnchor="end" className="fill-gp-ink-3 font-mono text-[10px]">
								{formatMetric(t, y)}
							</text>
						</g>
					))}
					<text x={(W + PAD.left) / 2} y={H - 6} textAnchor="middle" className="fill-gp-ink-2 text-[11px]">
						{x.direction === "lower" ? `← better · ${x.label}` : `${x.label} · better →`}
					</text>
					<text x={14} y={(H - PAD.bottom + PAD.top) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(H - PAD.bottom + PAD.top) / 2})`} className="fill-gp-ink-2 text-[11px]">
						{y.label} (better ↑)
					</text>
					{frontier.length > 1 && (
						<polyline
							points={frontier.map((s) => `${px(s.summary[x.key])},${py(s.summary[y.key])}`).join(" ")}
							className="fill-none stroke-gp-tab-500"
							strokeWidth={1.5}
							strokeDasharray="5 4"
						/>
					)}
					{points.map((s) => {
						const cx = px(s.summary[x.key]);
						const cy = py(s.summary[y.key]);
						const onFrontier = frontier.includes(s);
						const label = labels.get(s.id);
						return (
							<g key={s.id}>
								<title>{`${s.label}: ${formatMetric(s.summary[y.key], y)} · ${formatMetric(s.summary[x.key], x)}`}</title>
								<circle cx={cx} cy={cy} r={11} className="fill-transparent" />
								<circle cx={cx} cy={cy} r={5} strokeWidth={2} className={`stroke-gp-card ${onFrontier ? "fill-gp-tab-500" : "fill-gp-ink-3"}`} />
								{label && (
									<text x={label.x} y={label.y} textAnchor={label.anchor} className="fill-gp-ink text-[10.5px]">
										{s.label}
										<tspan className="fill-gp-ink-3 font-mono"> {formatMetric(s.summary[y.key], y)}</tspan>
									</text>
								)}
							</g>
						);
					})}
				</svg>
			</div>
			{caption && <figcaption className="text-[12px] text-gp-ink-3">
				Blue points are on the frontier: no other subject is better on both {y.label.toLowerCase()} and {x.label.toLowerCase()}.
			</figcaption>}
		</figure>
	);
}
