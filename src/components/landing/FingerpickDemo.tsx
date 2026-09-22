"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import TabStaveRow from "@/components/fingerpick/TabStaveRow";
import { layoutMeasureRows } from "@/components/fingerpick/fingerpickLayout";
import {
	FINGERPICK_DEMO_LOOP_MEASURE,
	FINGERPICK_DEMO_MEASURES,
	type FingerpickStage,
} from "@/lib/landing/fingerpickStage";
import { ENTER } from "./landingUi";

/**
 * The fingerpick chapter's stave: the real TabStaveRow drawn by VexFlow,
 * with the story's cursor, loop highlight and note reveal laid over it. The
 * cursor is placed the way the workspace's is — from the `data-measure-index`
 * / `data-slot-index` attributes the stave stamps on its notes — but from a
 * scroll progress rather than an audio clock. Loaded with `next/dynamic` so
 * VexFlow stays out of the landing's first bundle.
 */
const TIME_SIGNATURE: [number, number] = [4, 4];

export default function FingerpickDemo({
	stage,
	compact = false,
}: {
	stage: FingerpickStage;
	/** Draw only the row holding the story's measure — a phone's stage has room for one. */
	compact?: boolean;
}) {
	const container = useRef<HTMLDivElement>(null);
	const cursor = useRef<HTMLDivElement>(null);
	const highlight = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);

	useLayoutEffect(() => {
		const el = container.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const measures = useMemo(() => [...FINGERPICK_DEMO_MEASURES], []);
	const allRows = useMemo(() => layoutMeasureRows(measures, width, 0), [measures, width]);
	const rows = useMemo(
		() =>
			compact
				? allRows.filter(
						(r) =>
							stage.focusMeasure >= r.startMeasureNumber - 1 &&
							stage.focusMeasure < r.startMeasureNumber - 1 + r.measures.length,
					)
				: allRows,
		[allRows, compact, stage.focusMeasure],
	);

	// A passive effect like TabStaveRow's own draw, which as the child's runs
	// first — so the notes looked up here exist even on the commit that drew them.
	useEffect(() => {
		const el = container.current;
		const line = cursor.current;
		const block = highlight.current;
		if (!el || !line || !block || rows.length === 0) return;
		let frame = 0;
		let tries = 0;
		const apply = () => {
		// A stave that has just mounted may be a frame away from having its
		// notes stamped: retry a few frames rather than draw on nothing.
		if (!el.querySelector("[data-measure-index]") && tries++ < 10) {
			frame = requestAnimationFrame(apply);
			return;
		}
		const box = el.getBoundingClientRect();
		const noteAt = (m: number, s: number) =>
			el.querySelector<SVGElement>(`[data-measure-index="${m}"][data-slot-index="${s}"]`);

		// Reveal: notes past the written count stay invisible until their turn.
		let flat = 0;
		measures.forEach((measure, m) => {
			measure.slots.forEach((_, s) => {
				const note = noteAt(m, s);
				if (note) {
					note.style.transition = "opacity 0.25s ease-out";
					note.style.opacity = flat < stage.revealedSlots ? "1" : "0";
				}
				flat++;
			});
		});

		// Cursor: between this slot's note and the next, or the measure's end.
		const c = stage.cursor;
		const from = c && noteAt(c.measureIndex, c.slotIndex);
		if (c && from) {
			const svg = from.closest("svg");
			const fromRect = from.getBoundingClientRect();
			const next =
				noteAt(c.measureIndex, c.slotIndex + 1) ??
				(c.measureIndex + 1 < measures.length ? noteAt(c.measureIndex + 1, 0) : null);
			let toX: number;
			if (next && next.closest("svg") === svg) toX = next.getBoundingClientRect().left;
			else if (svg) {
				const x = Number(svg.getAttribute(`data-stave-${c.measureIndex}-x`) ?? 0);
				const w = Number(svg.getAttribute(`data-stave-${c.measureIndex}-w`) ?? 0);
				toX = svg.getBoundingClientRect().left + x + w;
			} else toX = fromRect.left;
			const x = fromRect.left + (toX - fromRect.left) * c.within - box.left;
			const svgRect = svg?.getBoundingClientRect();
			// Seen before: glide to the next reading; first seen: land there.
			const seen = line.style.opacity === "1";
			line.style.transition = seen ? "transform 0.1s linear, opacity 0.2s ease-out" : "opacity 0.2s ease-out";
			line.style.transform = `translateX(${Math.round(x - 1)}px)`;
			line.style.top = `${svgRect ? svgRect.top - box.top : 0}px`;
			line.style.height = `${svgRect ? svgRect.height : box.height}px`;
			line.style.opacity = "1";
		} else {
			line.style.opacity = "0";
		}

		// Loop: the looped measure's note area, as the workspace highlights the playing one.
		const m = FINGERPICK_DEMO_LOOP_MEASURE;
		const svg = el.querySelector<SVGElement>(`svg[data-stave-${m}-x]`);
		if (stage.loop && svg) {
			const x = Number(svg.getAttribute(`data-stave-${m}-x`) ?? 0);
			const w = Number(svg.getAttribute(`data-stave-${m}-w`) ?? 0);
			const r = svg.getBoundingClientRect();
			block.style.left = `${Math.round(r.left - box.left + x)}px`;
			block.style.top = `${Math.round(r.top - box.top)}px`;
			block.style.width = `${Math.round(w)}px`;
			block.style.height = `${Math.round(r.height)}px`;
			block.style.opacity = "1";
		} else {
			block.style.opacity = "0";
		}
		};
		apply();
		return () => cancelAnimationFrame(frame);
	}, [rows, measures, stage]);

	return (
		<div ref={container} className="relative min-h-[150px] w-full">
			<div
				ref={highlight}
				aria-hidden="true"
				className="pointer-events-none absolute border-t border-b border-denim transition-[opacity,left,width] duration-300 ease-out"
				style={{ opacity: 0, backgroundColor: "var(--measure-hl)" }}
			/>
			{/* The rows measure their own width; until the observer reports one there is nothing to lay out. */}
			<div className="flex flex-col pt-2">
				{rows.map((row) => (
					<div key={row.startMeasureNumber} className={ENTER}>
						<TabStaveRow
							measures={row.measures}
							measureWidths={row.widths}
							startMeasureNumber={row.startMeasureNumber}
							startMeasureIndex={row.startMeasureNumber - 1}
							timeSignature={TIME_SIGNATURE}
						/>
					</div>
				))}
			</div>
			<div
				ref={cursor}
				aria-hidden="true"
				className="pointer-events-none absolute left-0 z-10 w-0.5 bg-denim-accent shadow-(--glow-playhead)"
				style={{ opacity: 0 }}
			>
				<span
					aria-hidden="true"
					className="absolute -top-1.5 -left-1 size-0 border-x-[5px] border-t-6 border-x-transparent border-t-denim-accent"
				/>
			</div>
		</div>
	);
}
