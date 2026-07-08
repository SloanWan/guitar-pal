import {
	TabNote,
	TabNotePosition,
	TabTie,
	TabSlide,
	Tuplet,
	GhostNote,
	StemmableNote,
} from "vexflow";

import { Measure, Duration } from "@/lib/fingerpickTypes";

export const VEX_DURATION: Record<Duration, string> = {
	whole: "w",
	half: "h",
	quarter: "q",
	eighth: "8",
	// Tuplet notes use the underlying undivided duration ("8"); the Tuplet wrapper
	// adjusts tick values for correct Formatter spacing and draws the bracket.
	"eighth-triplet": "8",
	sixteenth: "16",
	rest: "q",
};

export interface VexFlowRenderData {
	notes: StemmableNote[];
	connectors: Array<TabTie | TabSlide>;
	tuplets: Tuplet[];
}

// Pure, deterministic mapping from a Measure to VexFlow note objects.
// No DOM access — VexFlow note constructors are DOM-free.
export function fingerpickToVexFlow(measure: Measure): VexFlowRenderData {
	const notes: StemmableNote[] = [];
	// posIndexMaps[slotIdx].get(stringIdx) = index in that TabNote's positions array.
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

	// Group consecutive "eighth-triplet" slots into sets of 3 and wrap each group in
	// a Tuplet. This adjusts each note's tick value (3 → 2 eighths) so the Formatter
	// spaces the measure correctly, and draws the bracket above the staff.
	const tuplets: Tuplet[] = [];
	let si = 0;
	while (si < measure.slots.length) {
		if (measure.slots[si].duration === "eighth-triplet") {
			const groupStart = si;
			while (si < measure.slots.length && measure.slots[si].duration === "eighth-triplet") {
				si++;
			}
			for (let j = groupStart; j < si; j += 3) {
				const group = notes.slice(j, j + 3);
				if (group.length === 3) tuplets.push(new Tuplet(group));
			}
		} else {
			si++;
		}
	}

	return { notes, connectors, tuplets };
}
