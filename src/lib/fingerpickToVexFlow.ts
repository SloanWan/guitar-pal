import {
	TabNote,
	TabNotePosition,
	TabTie,
	TabSlide,
	Tuplet,
	GhostNote,
	StemmableNote,
	GraceNote,
	GraceNoteGroup,
} from "vexflow";

import { Measure, Duration } from "@/lib/fingerpickTypes";

export const VEX_DURATION: Record<Duration, string> = {
	whole: "w",
	half: "h",
	quarter: "q",
	"dotted-quarter": "qd",
	eighth: "8",
	"dotted-eighth": "8d",
	// Tuplet notes use the underlying undivided duration; the Tuplet wrapper
	// adjusts tick values for correct Formatter spacing and draws the bracket.
	"eighth-triplet": "8",
	sixteenth: "16",
	"sixteenth-triplet": "16",
	"32nd": "32",
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
	// posIndexMaps[noteIdx].get(stringIdx) = index in that TabNote's positions array.
	// Indexed parallel to notes[], not to measure.slots[].
	const posIndexMaps: Map<number, number>[] = [];
	// Maps slot index → notes[] index (null for grace-note slots).
	const slotNoteIndex: (number | null)[] = [];
	let pendingGraceNotes: GraceNote[] = [];

	for (let slotIdx = 0; slotIdx < measure.slots.length; slotIdx++) {
		const slot = measure.slots[slotIdx];
		const duration = VEX_DURATION[slot.duration];

		if (slot.isGraceNote) {
			// Collect as a pending modifier; does not produce a standalone Voice tickable.
			pendingGraceNotes.push(new GraceNote({ keys: ["e/4"], duration: "8", slash: true }));
			slotNoteIndex.push(null);
			continue;
		}

		if (slot.duration === "rest") {
			pendingGraceNotes = [];
			const noteIdx = notes.length;
			notes.push(new GhostNote({ duration }));
			posIndexMaps.push(new Map());
			slotNoteIndex.push(noteIdx);
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
			pendingGraceNotes = [];
			const noteIdx = notes.length;
			notes.push(new GhostNote({ duration }));
			posIndexMaps.push(new Map());
			slotNoteIndex.push(noteIdx);
			continue;
		}

		const tabNote = new TabNote({ positions, duration }, true);
		if (pendingGraceNotes.length > 0) {
			tabNote.addModifier(new GraceNoteGroup(pendingGraceNotes));
			pendingGraceNotes = [];
		}
		const noteIdx = notes.length;
		notes.push(tabNote);
		posIndexMaps.push(posMap);
		slotNoteIndex.push(noteIdx);
	}

	const connectors: Array<TabTie | TabSlide> = [];

	for (let i = 1; i < measure.slots.length; i++) {
		const slot = measure.slots[i];
		if (slot.duration === "rest" || slot.isGraceNote) continue;

		const currNoteIdx = slotNoteIndex[i];
		if (currNoteIdx === null || currNoteIdx === undefined) continue;

		// Walk back to find the nearest preceding non-grace slot.
		let prevSlotIdx = i - 1;
		while (prevSlotIdx >= 0 && slotNoteIndex[prevSlotIdx] === null) prevSlotIdx--;
		if (prevSlotIdx < 0) continue;
		const prevNoteIdx = slotNoteIndex[prevSlotIdx];
		if (prevNoteIdx === null || prevNoteIdx === undefined) continue;

		const prevNote = notes[prevNoteIdx];
		const currNote = notes[currNoteIdx];
		const prevPosMap = posIndexMaps[prevNoteIdx];
		const currPosMap = posIndexMaps[currNoteIdx];

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
			// New technique values: no VexFlow connector yet — silent pass-through.
		});
	}

	// Group consecutive triplet slots (eighth-triplet or sixteenth-triplet) into
	// sets of 3, each wrapped in a Tuplet. The Tuplet adjusts tick values so the
	// Formatter spaces the measure correctly and draws the bracket above the staff.
	const tuplets: Tuplet[] = [];
	let si = 0;
	while (si < measure.slots.length) {
		const slotDuration = measure.slots[si].duration;
		if (slotDuration === "eighth-triplet" || slotDuration === "sixteenth-triplet") {
			const groupStart = si;
			while (si < measure.slots.length && measure.slots[si].duration === slotDuration) {
				si++;
			}
			for (let j = groupStart; j < si; j += 3) {
				const group: StemmableNote[] = [];
				for (let k = j; k < j + 3 && k < si; k++) {
					const noteIdx = slotNoteIndex[k];
					if (noteIdx !== null && noteIdx !== undefined) group.push(notes[noteIdx]);
				}
				if (group.length === 3) tuplets.push(new Tuplet(group));
			}
		} else {
			si++;
		}
	}

	return { notes, connectors, tuplets };
}
