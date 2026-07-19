"use client";

import { useEffect, useRef } from "react";
import { Renderer, TabStave, Voice, Formatter, Beam, Barline, StemmableNote } from "vexflow";

import { Measure } from "@/lib/fingerpickTypes";
import { fingerpickToVexFlow } from "@/lib/fingerpickToVexFlow";

// Layout constants — not props because they are fixed design decisions, not data.
// CLEF_WIDTH: the left offset that gives the "TAB" clef glyph room (~30 px needed).
export const CLEF_WIDTH = 15;
// Extra pixels appended to svgWidth so the 1px end-barline stroke is not clipped at the SVG boundary.
const BARLINE_CLIP_MARGIN = 3;
const RIGHT_PAD = 15;
const SVG_HEIGHT = 200;
const STAVE_Y = 10;
const TAB_GLYPH_WIDTH = 40;
const TECHNIQUE_CONNECTOR_PAD = 20;
const MIN_MEASURE_WIDTH = 120;
const HO_PO_EXTRA_WIDTH = 25;

interface TabStaveRowProps {
	/** One "row" worth of measures rendered into a single VexFlow context. */
	measures: Measure[];
	/** Measure number for the first measure in this row (1-indexed). */
	startMeasureNumber?: number;
	/** 0-indexed global measure index for this row's first measure; enables cursor data attributes. */
	startMeasureIndex?: number;
	/** Per-measure stave widths in the same order as `measures`, computed by the greedy layout pass. */
	measureWidths: number[];
}

// VexFlow's SVG backend emits colors as literal presentation attributes
// (black stave lines/fret numbers, a white occlusion patch behind each fret
// number) inherited from the root <svg>'s fill="black"/stroke="black" — it has
// no theme awareness. This walks the finished render and overwrites those
// attributes with theme-aware custom properties, per the design system's
// .sline/.fnum/.clef/.tech/.tech-arc token map. Runs after every draw() call;
// never touches note construction, layout, or the data-* cursor attributes.
function applyStaveTheme(svgEl: SVGSVGElement): void {
	svgEl.querySelectorAll<SVGPathElement>("g.vf-stave > path").forEach((el) => {
		el.setAttribute("stroke", "var(--line-strong)");
	});
	svgEl.querySelectorAll<SVGRectElement>("g.vf-stavebarline > rect").forEach((el) => {
		el.setAttribute("fill", "var(--line-strong)");
	});
	svgEl.querySelectorAll<SVGTextElement>("g.vf-clef text").forEach((el) => {
		el.setAttribute("fill", "var(--ink-faint)");
	});
	svgEl.querySelectorAll<SVGGElement>("g.vf-tabnote").forEach((noteGroup) => {
		noteGroup.querySelectorAll("text").forEach((el) => el.setAttribute("fill", "var(--ink)"));
		// Occlusion patch behind each fret number (masks the stave line
		// passing through it) — hardcoded white by VexFlow; must track the
		// actual surface behind the viewer so it doesn't show as a faint
		// square. The card wrapper was removed, so that surface is now the
		// workspace background, not the (former card) tab-viewer background.
		noteGroup
			.querySelectorAll("rect")
			.forEach((el) => el.setAttribute("fill", "var(--workspace-bg)"));
	});
	svgEl.querySelectorAll<SVGPathElement>("g.vf-stem path").forEach((el) => {
		el.setAttribute("stroke", "var(--ink)");
	});
	svgEl.querySelectorAll<SVGPathElement>("g.vf-beam path").forEach((el) => {
		el.setAttribute("fill", "var(--ink)");
	});
	svgEl.querySelectorAll<SVGTextElement>("g.vf-tuplet text").forEach((el) => {
		el.setAttribute("fill", "var(--ink)");
	});
	// Tie / hammer-on / pull-off connectors: closed filled arc shapes (stroke: none).
	svgEl.querySelectorAll<SVGPathElement>("g.vf-stavetie path").forEach((el) => {
		el.setAttribute("fill", "var(--ink)");
	});
	// Slide connectors and measure-number/technique-annotation text are all
	// emitted as bare elements directly under <svg> (VexFlow opens no group
	// for them). Slides are the only ungrouped <path fill="none">; technique
	// letters (H/P/sl./staccato/accent/…) are ungrouped <text> without a
	// local font-size, while measure numbers (TabStave.setMeasure) are
	// ungrouped <text> at the fixed 8pt VexFlow uses for that label.
	Array.from(svgEl.children).forEach((child) => {
		if (child.tagName === "path" && child.getAttribute("fill") === "none") {
			child.setAttribute("stroke", "var(--ink)");
		} else if (child.tagName === "text") {
			const isMeasureNumber = child.getAttribute("font-size") === "8pt";
			child.setAttribute("fill", isMeasureNumber ? "var(--ink-faint)" : "var(--ink)");
		}
	});
}

// No DOM side-effects — Formatter.preCalculateMinTotalWidth operates on Tickable objects only.
export function computeMeasureMinWidth(
	notes: StemmableNote[],
	isFirstInRow: boolean,
	techniqueCount: number,
): number {
	const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT);
	voice.addTickables(notes);
	const notesWidth = new Formatter().preCalculateMinTotalWidth([voice]);
	const raw =
		(isFirstInRow ? TAB_GLYPH_WIDTH : 0) +
		notesWidth +
		TECHNIQUE_CONNECTOR_PAD +
		techniqueCount * HO_PO_EXTRA_WIDTH +
		RIGHT_PAD;
	return Math.max(MIN_MEASURE_WIDTH, raw);
}

export default function TabStaveRow({
	measures,
	startMeasureNumber,
	startMeasureIndex,
	measureWidths,
}: TabStaveRowProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const div = containerRef.current;
		if (!div || measures.length === 0 || measureWidths.length === 0) return;

		let rafId: number | undefined;
		let cancelled = false;

		const renderToWidth = () => {
			if (cancelled) return;
			div.innerHTML = "";

			// SVG width = CLEF_WIDTH + stave content + margin so the end-barline isn't clipped.
			const svgWidth =
				CLEF_WIDTH + measureWidths.reduce((a, b) => a + b, 0) + BARLINE_CLIP_MARGIN;

			const renderer = new Renderer(div, Renderer.Backends.SVG);
			renderer.resize(svgWidth, SVG_HEIGHT);
			const ctx = renderer.getContext();
			ctx.setFont({ family: '"JetBrains Mono", ui-monospace, monospace', size: "10pt" });

			// Draw staves, accumulating x from per-measure widths.
			let staveX = CLEF_WIDTH;
			const staves = measures.map((_, i) => {
				const w = measureWidths[i];
				const stave = new TabStave(staveX, STAVE_Y, w);
				staveX += w;
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

			// Write note-area bounds for the cursor measure-highlight overlay.
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
				const beams = Beam.applyAndGetBeams(voice, -1);
				voice.draw(ctx, staves[i]);
				connectors.forEach((c) => c.setContext(ctx).draw());
				beams.forEach((b) => b.setContext(ctx).draw());
				tuplets.forEach((t) => t.setContext(ctx).draw());

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

			const svgEl = div.querySelector("svg");
			if (svgEl) applyStaveTheme(svgEl);
		};

		// Initial render; ResizeObserver re-renders on container size changes.
		rafId = requestAnimationFrame(renderToWidth);
		const observer = new ResizeObserver(() => {
			if (rafId !== undefined) cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(renderToWidth);
		});
		observer.observe(div);

		return () => {
			cancelled = true;
			observer.disconnect();
			if (rafId !== undefined) cancelAnimationFrame(rafId);
			div.innerHTML = "";
		};
	}, [measures, startMeasureNumber, startMeasureIndex, measureWidths]);

	return <div ref={containerRef} className="font-mono w-full" />;
}
