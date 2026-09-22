"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import TabStaveRow from "@/components/fingerpick/TabStaveRow";
import { layoutMeasureRows } from "@/components/fingerpick/fingerpickLayout";
import type { Measure } from "@/lib/fingerpickTypes";
import { ENTER } from "./landingUi";

/**
 * A pattern's measures as the fingerpick page draws them, with one measure
 * optionally highlighted the way the page marks the one playing. Sizes its
 * rows from its own width; loaded with `next/dynamic` where it appears, so
 * VexFlow stays out of the landing's first bundle.
 */
export default function StaveRows({
	measures,
	timeSignature,
	highlightMeasure = null,
	/** Draw only the row holding the highlighted measure (or the first row). */
	compact = false,
}: {
	measures: Measure[];
	timeSignature: [number, number];
	highlightMeasure?: number | null;
	compact?: boolean;
}) {
	const container = useRef<HTMLDivElement>(null);
	const block = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);

	useLayoutEffect(() => {
		const el = container.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const allRows = useMemo(() => layoutMeasureRows(measures, width, 0), [measures, width]);
	const rows = useMemo(() => {
		if (!compact) return allRows;
		const focus = highlightMeasure ?? 0;
		return allRows.filter(
			(r) => focus >= r.startMeasureNumber - 1 && focus < r.startMeasureNumber - 1 + r.measures.length,
		);
	}, [allRows, compact, highlightMeasure]);

	// After TabStaveRow's own draw effect, which as the child's runs first; a
	// stave that has just mounted may still be a frame away from having its
	// note bounds stamped, so the lookup retries a few frames before giving up.
	useEffect(() => {
		const el = container.current;
		const hl = block.current;
		if (!el || !hl) return;
		const m = highlightMeasure;
		let frame = 0;
		let tries = 0;
		const apply = () => {
			const svg = m === null ? null : el.querySelector<SVGElement>(`svg[data-stave-${m}-x]`);
			if (m !== null && !svg && rows.length > 0 && tries++ < 10) {
				frame = requestAnimationFrame(apply);
				return;
			}
			if (m === null || !svg) {
				hl.style.opacity = "0";
				return;
			}
			const box = el.getBoundingClientRect();
			const r = svg.getBoundingClientRect();
			const x = Number(svg.getAttribute(`data-stave-${m}-x`) ?? 0);
			const w = Number(svg.getAttribute(`data-stave-${m}-w`) ?? 0);
			hl.style.left = `${Math.round(r.left - box.left + x)}px`;
			hl.style.top = `${Math.round(r.top - box.top)}px`;
			hl.style.width = `${Math.round(w)}px`;
			hl.style.height = `${Math.round(r.height)}px`;
			hl.style.opacity = "1";
		};
		apply();
		return () => cancelAnimationFrame(frame);
	}, [rows, highlightMeasure]);

	return (
		<div ref={container} className="relative w-full">
			<div
				ref={block}
				aria-hidden="true"
				className="pointer-events-none absolute border-t border-b border-denim transition-[opacity,left,top,width] duration-300 ease-out"
				style={{ opacity: 0, backgroundColor: "var(--measure-hl)" }}
			/>
			<div className="flex flex-col pt-2">
				{rows.map((row) => (
					<div key={row.startMeasureNumber} className={ENTER}>
						<TabStaveRow
							measures={row.measures}
							measureWidths={row.widths}
							startMeasureNumber={row.startMeasureNumber}
							startMeasureIndex={row.startMeasureNumber - 1}
							timeSignature={timeSignature}
						/>
					</div>
				))}
			</div>
		</div>
	);
}
