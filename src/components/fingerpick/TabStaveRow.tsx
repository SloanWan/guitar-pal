"use client";

import { useEffect, useRef } from "react";
import {
	Renderer,
	TabStave,
	TabNote,
	TabNotePosition,
	Voice,
	Formatter,
	Beam,
	TabTie,
	TabSlide,
	GhostNote,
	StemmableNote,
	Barline,
} from "vexflow";

import { Measure, Duration } from "@/lib/fingerpickTypes";

const VEX_DURATION: Record<Duration, string> = {
	whole: "w",
	half: "h",
	quarter: "q",
	eighth: "8",
	sixteenth: "16",
	rest: "q",
};

interface VexFlowRenderData {
	notes: StemmableNote[];
	connectors: Array<TabTie | TabSlide>;
}

// fingerpickToVexFlow — pure, deterministic function.
// Maps each BeatSlot to a VexFlow StemmableNote and builds technique connectors.
// No DOM access; VexFlow note constructors are DOM-free.
//
// Unit-test examples (str = VexFlow string index, 1=high e, 6=low E):
//
//   Input: slot { duration:"quarter", strings[5]={fret:0,...} }
//   Output: notes=[TabNote({ positions:[{str:6,fret:0}], duration:"q" })], connectors=[]
//
//   Input: slot1 { strings[3]={fret:0,...} }, slot2 { strings[3]={fret:2,technique:"hammer-on",...} }
//   Output: notes=[TabNote pos=[{str:4,fret:0}], TabNote pos=[{str:4,fret:2}]],
//           connectors=[TabTie.createHammeron({firstNote,lastNote,firstIndexes:[0],lastIndexes:[0]})]
//
//   Input: slot1 { strings[2]={fret:3,...} }, slot2 { strings[2]={fret:5,technique:"slide-up",...} }
//   Output: connectors=[TabSlide.createSlideUp({firstNote,lastNote,firstIndexes:[0],lastIndexes:[0]})]
//
//   Input: slot1 { strings[0]={fret:5,...} }, slot2 { strings[0]={fret:5,tied:true,...} }
//   Output: connectors=[new TabTie({firstNote,lastNote,firstIndexes:[0],lastIndexes:[0]})]
//
//   Input: slot { strings[0]={fret:null,muted:true,...} }
//   Output: notes=[TabNote({ positions:[{str:1,fret:"x"}], duration:"q" })], connectors=[]
//
//   Input: slot { duration:"rest", strings all silent }
//   Output: notes=[GhostNote({ duration:"q" })], connectors=[]
function fingerpickToVexFlow(measure: Measure): VexFlowRenderData {
	const notes: StemmableNote[] = [];
	// posIndexMaps[slotIdx].get(stringIdx) = index in that TabNote's positions array.
	// Used to build firstIndexes/lastIndexes for connectors.
	const posIndexMaps: Map<number, number>[] = [];

	for (const slot of measure.slots) {
		const duration = VEX_DURATION[slot.duration];

		if (slot.duration === "rest") {
			notes.push(new GhostNote({ duration }));
			posIndexMaps.push(new Map());
			continue;
		}

		const positions: TabNotePosition[] = [];
		const posMap = new Map<number, number>();

		slot.strings.forEach((sf, stringIdx) => {
			const isPlayed = sf.fret !== null || sf.muted;
			if (!isPlayed) return;
			posMap.set(stringIdx, positions.length);
			const fret: number | string = sf.muted ? "x" : (sf.fret ?? 0);
			positions.push({ str: stringIdx + 1, fret });
		});

		if (positions.length === 0) {
			notes.push(new GhostNote({ duration }));
			posIndexMaps.push(new Map());
			continue;
		}

		notes.push(new TabNote({ positions, duration }, true));
		posIndexMaps.push(posMap);
	}

	const connectors: Array<TabTie | TabSlide> = [];

	for (let i = 1; i < measure.slots.length; i++) {
		const slot = measure.slots[i];
		if (slot.duration === "rest") continue;

		const prevNote = notes[i - 1];
		const currNote = notes[i];
		const prevPosMap = posIndexMaps[i - 1];
		const currPosMap = posIndexMaps[i];

		slot.strings.forEach((sf, stringIdx) => {
			if (sf.fret === null && !sf.tied) return;
			if (!sf.tied && sf.technique === null) return;

			const prevIdx = prevPosMap.get(stringIdx);
			const currIdx = currPosMap.get(stringIdx);
			if (prevIdx === undefined || currIdx === undefined) return;

			const tieNotes = {
				firstNote: prevNote,
				lastNote: currNote,
				firstIndexes: [prevIdx],
				lastIndexes: [currIdx],
			};

			if (sf.tied) {
				connectors.push(new TabTie(tieNotes));
			} else if (sf.technique === "hammer-on") {
				connectors.push(TabTie.createHammeron(tieNotes));
			} else if (sf.technique === "pull-off") {
				connectors.push(TabTie.createPulloff(tieNotes));
			} else if (sf.technique === "slide-up") {
				connectors.push(TabSlide.createSlideUp(tieNotes));
			} else if (sf.technique === "slide-down") {
				connectors.push(TabSlide.createSlideDown(tieNotes));
			}
		});
	}

	return { notes, connectors };
}

// Layout constants — not props because they are fixed design decisions, not data.
// CLEF_WIDTH: the left offset that gives the "TAB" clef glyph room (~30 px needed).
const CLEF_WIDTH = 15;
const RIGHT_PAD = 15;
const SVG_HEIGHT = 180;
const STAVE_Y = 10;

interface TabStaveRowProps {
	/** One "row" worth of measures rendered into a single VexFlow context. */
	measures: Measure[];
	/** Measure number for the first measure in this row (1-indexed). */
	startMeasureNumber?: number;
}

export default function TabStaveRow({ measures, startMeasureNumber }: TabStaveRowProps) {
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

			// Format and draw notes for each measure against its own stave.
			measures.forEach((measure, i) => {
				const { notes, connectors } = fingerpickToVexFlow(measure);
				const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT);
				voice.addTickables(notes);
				const noteWidth = staves[i].getNoteEndX() - staves[i].getNoteStartX() - 10;
				new Formatter().joinVoices([voice]).format([voice], noteWidth);
				// Beams must be applied before voice.draw so stem directions are set.
				const beams = Beam.applyAndGetBeams(voice, -1);
				voice.draw(ctx, staves[i]);
				connectors.forEach((c) => c.setContext(ctx).draw());
				beams.forEach((b) => b.setContext(ctx).draw());
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
	}, [measures, startMeasureNumber]);

	return <div ref={containerRef} className="font-mono w-full" />;
}
