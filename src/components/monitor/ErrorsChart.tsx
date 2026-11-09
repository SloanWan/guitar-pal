"use client";

import { useState } from "react";
import { useElementWidth } from "@/components/useElementWidth";
import { formatBucket } from "@/lib/telemetry/monitorFormat";
import { ERROR_GROUPS, type ErrorBucket, type ErrorGroup } from "@/lib/telemetry/summary";

/**
 * Errors per hour or day, stacked by group (#458). Four series in a fixed order,
 * a legend for them, a tooltip per column (the column's whole band is its hit
 * target, by pointer or keyboard), and the same numbers as a table below — two
 * of the light colours sit under 3:1 on white, so the table is not optional.
 */

export const GROUP_LABELS: Record<ErrorGroup, string> = {
	page: "Page errors",
	audio: "Audio",
	supabase: "Supabase",
	server: "Server",
};
const SERIES: Record<ErrorGroup, string> = { page: "var(--mon-s1)", audio: "var(--mon-s2)", supabase: "var(--mon-s3)", server: "var(--mon-s4)" };

/** Drawn at the card's own width, so the axis text stays its size; this until measured. */
const FALLBACK_W = 720;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 32 };
const BAR_MAX = 24;
const GAP = 2;
const RADIUS = 4;

/** 1, 2, 5 × 10ⁿ at or over `max`, so the ticks land on round numbers. */
function niceCeil(max: number): number {
	if (max <= 1) return 1;
	const power = 10 ** Math.floor(Math.log10(max));
	const step = [1, 2, 5, 10].find((m) => m * power >= max) ?? 10;
	return step * power;
}

/** A column segment, rounded at the data end only. */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
	const rr = Math.min(r, h, w / 2);
	return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

const total = (b: ErrorBucket) => ERROR_GROUPS.reduce((n, g) => n + b.counts[g], 0);

export default function ErrorsChart({ buckets, bucket }: { buckets: readonly ErrorBucket[]; bucket: "hour" | "day" }) {
	const [active, setActive] = useState<number | null>(null);
	const [measure, measured] = useElementWidth<HTMLDivElement>();
	const W = measured || FALLBACK_W;
	const max = niceCeil(Math.max(0, ...buckets.map(total)));
	const plotW = W - PAD.left - PAD.right;
	const plotH = H - PAD.top - PAD.bottom;
	const band = plotW / Math.max(1, buckets.length);
	const barW = Math.min(BAR_MAX, band * 0.62);
	const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
	const ticks = max === 1 ? [0, 1] : [0, max / 2, max];
	// As many axis labels as fit, about one per 64px.
	const every = Math.max(1, Math.ceil(buckets.length / Math.max(2, Math.floor(plotW / 64))));
	const shown = active === null ? null : buckets[active];
	const unit = bucket === "hour" ? "hour" : "day";

	return (
		<div className="mon-chart" ref={measure}>
			<ul className="mon-legend" aria-label="Error groups">
				{ERROR_GROUPS.map((g) => (
					<li key={g}>
						<span className="mon-swatch" style={{ background: SERIES[g] }} aria-hidden />
						{GROUP_LABELS[g]}
					</li>
				))}
			</ul>
			<svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Errors per ${unit}, by group`} onPointerLeave={() => setActive(null)}>
				{ticks.map((t) => (
					<g key={t}>
						<line className="mon-grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
						<text className="mon-axis" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
							{t}
						</text>
					</g>
				))}
				{buckets.map((b, i) => {
					const x = PAD.left + i * band + (band - barW) / 2;
					const groups = ERROR_GROUPS.filter((g) => b.counts[g] > 0);
					let base = 0;
					return (
						<g key={b.key}>
							{groups.map((g, gi) => {
								const top = base + b.counts[g];
								const y0 = y(base) - (gi > 0 ? GAP : 0);
								const y1 = y(top);
								base = top;
								const h = Math.max(0, y0 - y1);
								const last = gi === groups.length - 1;
								return last ? (
									<path key={g} d={topRounded(x, y1, barW, h, RADIUS)} fill={SERIES[g]} />
								) : (
									<rect key={g} x={x} y={y1} width={barW} height={h} fill={SERIES[g]} />
								);
							})}
							{i % every === 0 && (
								<text className="mon-axis" x={x + barW / 2} y={H - 8} textAnchor="middle">
									{formatBucket(b.key)}
								</text>
							)}
							<rect
								className="mon-hit"
								x={PAD.left + i * band}
								y={PAD.top}
								width={band}
								height={plotH}
								tabIndex={0}
								aria-label={`${formatBucket(b.key)}: ${total(b)} error${total(b) === 1 ? "" : "s"}`}
								onPointerEnter={() => setActive(i)}
								onFocus={() => setActive(i)}
								onBlur={() => setActive(null)}
							/>
						</g>
					);
				})}
			</svg>
			{shown && active !== null && (
				<div
					className="mon-tip"
					role="status"
					style={{
						left: Math.max(0, Math.min(PAD.left + (active + 1) * band + 8, W - 170)),
					}}
				>
					<div className="mon-tip-head">
						{bucket === "hour" ? shown.key.replace(" ", " · ") + ":00" : shown.key} · {total(shown)} total
					</div>
					{ERROR_GROUPS.map((g) => (
						<div className="mon-tip-row" key={g}>
							<span className="mon-key" style={{ background: SERIES[g] }} aria-hidden />
							<span>{GROUP_LABELS[g]}</span>
							<b>{shown.counts[g]}</b>
						</div>
					))}
				</div>
			)}
			<details className="mon-details">
				<summary>Show as a table</summary>
				<div className="mon-scroll">
					<table className="mon-table">
						<thead>
							<tr>
								<th>{bucket === "hour" ? "Hour" : "Day"}</th>
								{ERROR_GROUPS.map((g) => (
									<th key={g} className="mon-num">
										{GROUP_LABELS[g]}
									</th>
								))}
								<th className="mon-num">Total</th>
							</tr>
						</thead>
						<tbody>
							{buckets.map((b) => (
								<tr key={b.key}>
									<td>{b.key}</td>
									{ERROR_GROUPS.map((g) => (
										<td key={g} className="mon-num">
											{b.counts[g]}
										</td>
									))}
									<td className="mon-num">{total(b)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</details>
		</div>
	);
}
