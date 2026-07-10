import {
	TabNote,
	TabNotePosition,
	TabTie,
	TabSlide,
	Tuplet,
	GhostNote,
	StemmableNote,
	GraceTabNote,
	GraceNoteGroup,
	Element as VexElement,
	Annotation,
	AnnotationVerticalJustify,
	Tremolo,
	Vibrato,
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
	let pendingGraceNotes: GraceTabNote[] = [];

	for (let slotIdx = 0; slotIdx < measure.slots.length; slotIdx++) {
		const slot = measure.slots[slotIdx];
		const duration = VEX_DURATION[slot.duration];

		if (slot.isGraceNote) {
			// Collect as a pending modifier; does not produce a standalone Voice tickable.
			const gracePositions: TabNotePosition[] = [];
			slot.strings.forEach((sf, stringIdx) => {
				if (sf.fret === null && !sf.muted) return;
				const fret: number | string = sf.muted ? "x" : (sf.fret ?? 0);
				gracePositions.push({ str: stringIdx + 1, fret });
			});
			if (gracePositions.length > 0) {
				const gtn = new GraceTabNote({ positions: gracePositions, duration: "8" });
				// GraceTabNote.fontScale = 2/3 exists in VexFlow metrics but
				// TabNote.drawPositions() renders fret text via per-position Element
				// objects typed as 'TabNote.text' — fontScale is never applied there.
				// Scale each fret element's font manually to match the 2/3 intent.
				// GraceTabNote has no stem, so there is no acciaccatura slash to add;
				// GraceNoteGroup's showSlur param handles the optional tie arc only.
				type GtnPrivate = { fretElement: VexElement[]; width: number };
				const priv = gtn as unknown as GtnPrivate;
				priv.fretElement.forEach((el) => el.setFontSize(6));
				priv.width = priv.fretElement.reduce((max, el) => Math.max(max, el.getWidth()), 0);
				pendingGraceNotes.push(gtn);
			}
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

		// Accumulate per-slot renderable modifiers from active StringFret flags.
		let slotStaccato = false;
		let slotAccent = false;
		let slotPickStroke: "down" | "up" | undefined;
		let slotTremolo: "8th" | "16th" | "32nd" | undefined;
		let slotVibrato = false;
		let slotVibratoWide = false;
		let slotTapping = false;
		let slotTrill = false;
		slot.strings.forEach((sf) => {
			if (sf.fret === null && !sf.muted) return;
			if (sf.staccato) slotStaccato = true;
			if (sf.accent) slotAccent = true;
			if (!slotPickStroke && sf.pickStroke) slotPickStroke = sf.pickStroke;
			if (!slotTremolo && sf.tremoloPickingSpeed) slotTremolo = sf.tremoloPickingSpeed;
			if (sf.technique === "vibrato") slotVibrato = true;
			if (sf.technique === "vibrato-wide") slotVibratoWide = true;
			if (sf.technique === "tapping") slotTapping = true;
			if (sf.technique === "trill") slotTrill = true;
		});
		if (slotStaccato) {
			tabNote.addModifier(
				new Annotation(".").setVerticalJustification(AnnotationVerticalJustify.TOP),
			);
		}
		if (slotAccent) {
			tabNote.addModifier(
				new Annotation(">").setVerticalJustification(AnnotationVerticalJustify.TOP),
			);
		}
		if (slotPickStroke) {
			tabNote.addModifier(
				new Annotation(slotPickStroke === "down" ? "⊓" : "V").setVerticalJustification(
					AnnotationVerticalJustify.TOP,
				),
			);
		}
		if (slotTremolo) {
			const slashes = slotTremolo === "8th" ? 1 : slotTremolo === "16th" ? 2 : 3;
			tabNote.addModifier(new Tremolo(slashes));
		}
		// Vibrato constructor calls setVibratoWidth(), which measures glyph width via
		// the canvas API. In non-browser environments (jsdom, Node) it throws because
		// getWidth() returns 0. Wrap in try-catch so the adapter stays test-safe.
		if (slotVibratoWide || slotVibrato) {
			try {
				const vib = new Vibrato();
				if (slotVibratoWide) vib.setVibratoWidth(40);
				tabNote.addModifier(vib);
			} catch {
				// No canvas context (jsdom / SSR) — skip modifier; renders correctly in browser.
			}
		}
		if (slotTapping) {
			tabNote.addModifier(
				new Annotation("T")
					.setVerticalJustification(AnnotationVerticalJustify.TOP)
					.setFont("Geist Mono, monospace", 10),
			);
		}
		if (slotTrill) {
			tabNote.addModifier(
				new Annotation("tr~~~")
					.setVerticalJustification(AnnotationVerticalJustify.TOP)
					.setFont("Geist Mono, monospace", 10),
			);
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
