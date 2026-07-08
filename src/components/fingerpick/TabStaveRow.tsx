"use client";

import { useEffect, useRef } from "react";
import { Renderer, TabStave, Voice, Formatter, Beam, Barline } from "vexflow";

import { Measure } from "@/lib/fingerpickTypes";
import { fingerpickToVexFlow } from "@/lib/fingerpickToVexFlow";

// Layout constants — not props because they are fixed design decisions, not data.
// CLEF_WIDTH: the left offset that gives the "TAB" clef glyph room (~30 px needed).
const CLEF_WIDTH = 15;
const RIGHT_PAD = 15;
const SVG_HEIGHT = 200;
const STAVE_Y = 10;

interface TabStaveRowProps {
	/** One "row" worth of measures rendered into a single VexFlow context. */
	measures: Measure[];
	/** Measure number for the first measure in this row (1-indexed). */
	startMeasureNumber?: number;
	/** 0-indexed global measure index for this row's first measure; enables cursor data attributes. */
	startMeasureIndex?: number;
}

export default function TabStaveRow({
	measures,
	startMeasureNumber,
	startMeasureIndex,
}: TabStaveRowProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const div = containerRef.current;
		if (!div || measures.length === 0) return;

		let rafId: number | undefined;
		let cancelled = false;

		const renderToWidth = (containerWidth: number) => {
			if (cancelled || containerWidth < 1) return;
			div.innerHTML = "";

			const n = measures.length;
			// totalStaveWidth fills the container; floor to int so positions stay on pixels.
			const totalStaveWidth = Math.max(n * 50, containerWidth - CLEF_WIDTH - RIGHT_PAD);
			const perMeasureWidth = Math.floor(totalStaveWidth / n);

			const renderer = new Renderer(div, Renderer.Backends.SVG);
			renderer.resize(containerWidth, SVG_HEIGHT);
			const ctx = renderer.getContext();
			ctx.setFont({ family: "'Geist Mono', ui-monospace, monospace", size: "10pt" });

			// Draw all staves first so their note-region bounds are available when
			// we format voices below.
			// • Only the first stave gets addTabGlyph() — standard notation convention.
			// • Staves 2…N suppress their left barline (Barline.type.NONE) so there is
			//   no double barline at measure boundaries — only the preceding stave's
			//   right barline shows.
			const staves = measures.map((_, i) => {
				const x = CLEF_WIDTH + i * perMeasureWidth;
				// Last stave absorbs rounding remainder so the row fills the container.
				const w =
					i === n - 1
						? Math.max(50, totalStaveWidth - perMeasureWidth * (n - 1))
						: perMeasureWidth;
				const stave = new TabStave(x, STAVE_Y, w);
				if (i === 0) {
					stave.addTabGlyph();
				} else {
					stave.setBegBarType(Barline.type.NONE);
				}
				const measNum =
					startMeasureNumber !== undefined ? startMeasureNumber + i : undefined;
				if (measNum !== undefined) stave.setMeasure(measNum);
				stave.setContext(ctx);
				stave.draw();
				return stave;
			});

			// Store each stave's note-area bounds so the cursor can position the measure
			// background highlight without knowing the layout math inside this function.
			if (startMeasureIndex !== undefined) {
				const svgEl = div.querySelector("svg");
				if (svgEl) {
					staves.forEach((stave, i) => {
						const g = startMeasureIndex + i;
						svgEl.setAttribute(`data-stave-${g}-x`, String(stave.getNoteStartX()));
						svgEl.setAttribute(
							`data-stave-${g}-w`,
							String(stave.getNoteEndX() - stave.getNoteStartX()),
						);
					});
				}
			}

			// Format and draw notes for each measure against its own stave.
			measures.forEach((measure, i) => {
				const { notes, connectors, tuplets } = fingerpickToVexFlow(measure);
				const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT);
				voice.addTickables(notes);
				const noteWidth = staves[i].getNoteEndX() - staves[i].getNoteStartX() - 10;
				new Formatter().joinVoices([voice]).format([voice], noteWidth);
				// Beams must be applied before voice.draw so stem directions are set.
				const beams = Beam.applyAndGetBeams(voice, -1);
				voice.draw(ctx, staves[i]);
				connectors.forEach((c) => c.setContext(ctx).draw());
				beams.forEach((b) => b.setContext(ctx).draw());
				tuplets.forEach((t) => t.setContext(ctx).draw());

				// Tag each note's SVG element so the cursor RAF loop can query by
				// global measure/slot index and resolve screen coordinates via getBoundingClientRect.
				if (startMeasureIndex !== undefined) {
					const globalMeasureIdx = startMeasureIndex + i;
					notes.forEach((note, j) => {
						const el = note.getSVGElement();
						if (el) {
							el.setAttribute("data-measure-index", String(globalMeasureIdx));
							el.setAttribute("data-slot-index", String(j));
						}
					});
				}
			});
		};

		// ResizeObserver drives rendering — fires on mount with the row's initial
		// clientWidth and again on any resize. rAF debounces rapid events.
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const width = Math.floor(entry.contentRect.width);
			if (rafId !== undefined) cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => renderToWidth(width));
		});

		observer.observe(div);

		return () => {
			cancelled = true;
			observer.disconnect();
			if (rafId !== undefined) cancelAnimationFrame(rafId);
			div.innerHTML = "";
		};
	}, [measures, startMeasureNumber, startMeasureIndex]);

	return <div ref={containerRef} className="font-mono w-full" />;
}
