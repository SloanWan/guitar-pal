"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import TabStaveRow, { CLEF_WIDTH } from "@/components/fingerpick/TabStaveRow";
import { layoutMeasureRows, ROW_TRAILING_PAD, type MeasureRow } from "@/components/fingerpick/fingerpickLayout";
import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import type { TabSlot } from "./SongPlayer";

/** From this width two sixteenth-note bars sit side by side; below it, one a row. */
const TWO_A_ROW = 520;

/** Width the layout is asked at to read each measure's natural share of a row. */
const NATURAL = 100_000;

/**
 * Rows of `perRow` measures, each row stretched to `width` in the proportions
 * the fingerpick layout gives its measures — even rows, unlike the page's
 * greedy fill, which here would set three bars over one.
 */
function evenRows(measures: Measure[], width: number, perRow: number): MeasureRow[] {
	const rows: MeasureRow[] = [];
	const space = width - CLEF_WIDTH - ROW_TRAILING_PAD;
	for (let start = 0; start < measures.length; start += perRow) {
		const chunk = measures.slice(start, start + perRow);
		const [natural] = layoutMeasureRows(chunk, NATURAL, 0);
		const total = natural.widths.reduce((a, b) => a + b, 0);
		rows.push({ measures: chunk, startMeasureNumber: start + 1, widths: natural.widths.map((w) => (w / total) * space) });
	}
	return rows;
}

/**
 * The song's picking as the fingerpick page draws it — the real TabStaveRow,
 * every measure, two to a row (one on a phone) so the rows are always even,
 * with a playhead on the note the engine is sounding (or, faded, on the one a
 * silent preview has reached). The note is found
 * the way the workspace finds it, by the `data-measure-index` /
 * `data-slot-index` the stave stamps on its notes. Loaded with `next/dynamic`
 * so VexFlow stays out of the first bundle.
 */
export default function SongTab({
	pattern,
	slot,
	preview = false,
}: {
	pattern: FingerpickPattern;
	slot: TabSlot | null;
	/** The slot is a silent walk-through, not the engine: the playhead is drawn faded. */
	preview?: boolean;
}) {
	const container = useRef<HTMLDivElement>(null);
	const cursor = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);

	useLayoutEffect(() => {
		const el = container.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const rows = useMemo(() => {
		if (width === 0) return [];
		return evenRows(pattern.measures, width, width >= TWO_A_ROW ? 2 : 1);
	}, [pattern.measures, width]);

	// After TabStaveRow's own draw effect (the child's runs first); a stave that
	// has just mounted may be a frame from having its notes stamped, so retry.
	useEffect(() => {
		const el = container.current;
		const line = cursor.current;
		if (!el || !line) return;
		let frame = 0;
		let tries = 0;
		const apply = () => {
			const note =
				slot &&
				el.querySelector<SVGElement>(
					`[data-measure-index="${slot.measureIndex}"][data-slot-index="${slot.slotIndex}"]`,
				);
			if (slot && !note && tries++ < 10) {
				frame = requestAnimationFrame(apply);
				return;
			}
			const svg = note?.closest("svg");
			if (!note || !svg) {
				line.style.opacity = "0";
				return;
			}
			const box = el.getBoundingClientRect();
			const n = note.getBoundingClientRect();
			const s = svg.getBoundingClientRect();
			// Glide along a row; jump (no transition) when the row changes.
			const top = `${Math.round(s.top - box.top)}px`;
			const sameRow = line.style.top === top && line.style.opacity !== "0";
			line.style.transition = sameRow ? "transform 90ms linear" : "none";
			line.style.transform = `translateX(${Math.round(n.left + n.width / 2 - box.left - 1)}px)`;
			line.style.top = top;
			line.style.height = `${Math.round(s.height)}px`;
			line.style.opacity = preview ? "0.45" : "1";
		};
		apply();
		return () => cancelAnimationFrame(frame);
	}, [rows, slot, preview]);

	return (
		<div ref={container} className="ld-tab relative min-h-[150px] w-full">
			<div className="flex flex-col">
				{rows.map((row) => (
					<TabStaveRow
						key={row.startMeasureNumber}
						measures={row.measures}
						measureWidths={row.widths}
						startMeasureNumber={row.startMeasureNumber}
						startMeasureIndex={row.startMeasureNumber - 1}
						timeSignature={pattern.timeSignature}
					/>
				))}
			</div>
			<div
				ref={cursor}
				aria-hidden="true"
				className="ld-tab-playhead pointer-events-none absolute left-0 z-10 w-0.5 rounded-full bg-gp-m-500"
				style={{ opacity: 0 }}
			/>
		</div>
	);
}
