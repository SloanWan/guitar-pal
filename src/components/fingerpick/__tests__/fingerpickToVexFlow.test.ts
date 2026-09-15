import { describe, it, expect } from "vitest";
import {
	TabNote,
	GhostNote,
	StaveNote,
	TabTie,
	TabSlide,
	Voice,
	Beam,
	GraceNoteGroup,
	GraceTabNote,
	Annotation,
	Tremolo,
	Vibrato,
	Stroke,
} from "vexflow";

import { fingerpickToVexFlow, VEX_DURATION } from "@/lib/fingerpickToVexFlow";
import type { BeatSlot, Measure, StringFret, Duration, Technique } from "@/lib/fingerpickTypes";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function strings6(
	overrides: Record<number, Partial<StringFret>> = {}
): [StringFret, StringFret, StringFret, StringFret, StringFret, StringFret] {
	const make = (i: number): StringFret => ({
		fret: null,
		technique: null,
		tied: false,
		muted: false,
		...(overrides[i] ?? {}),
	});
	return [make(0), make(1), make(2), make(3), make(4), make(5)];
}

function beatSlot(
	id: string,
	duration: Duration,
	strOverrides: Record<number, Partial<StringFret>> = {}
): BeatSlot {
	return { id, duration, strings: strings6(strOverrides) };
}

function measure(slots: BeatSlot[]): Measure {
	return { id: "m", slots };
}

function voiceFrom(notes: ReturnType<typeof fingerpickToVexFlow>["notes"]) {
	const v = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT);
	v.addTickables(notes);
	return v;
}

// ─── VEX_DURATION (duration-to-VexFlow-key mapping) ──────────────────────────

describe("VEX_DURATION", () => {
	it.each([
		["whole", "w"],
		["half", "h"],
		["quarter", "q"],
		["eighth", "8"],
		["sixteenth", "16"],
	] as const)('maps "%s" → "%s"', (dur, expected) => {
		expect(VEX_DURATION[dur]).toBe(expected);
	});
});

// ─── fingerpickToVexFlow ──────────────────────────────────────────────────────

describe("fingerpickToVexFlow — empty / silent", () => {
	it("empty slots array → no notes, no connectors", () => {
		const { notes, connectors } = fingerpickToVexFlow(measure([]));
		expect(notes).toHaveLength(0);
		expect(connectors).toHaveLength(0);
	});

	it("slot with all strings silent becomes a GhostNote", () => {
		const { notes, connectors } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter")])
		);
		expect(notes).toHaveLength(1);
		expect(notes[0]).toBeInstanceOf(GhostNote);
		expect(connectors).toHaveLength(0);
	});

	it("rest slot becomes a visible rest StaveNote keeping its own duration", () => {
		const { notes } = fingerpickToVexFlow(
			measure([{ ...beatSlot("s1", "eighth", { 0: { fret: 5 } }), isRest: true }])
		);
		expect(notes).toHaveLength(1);
		// A rest renders a visible glyph (StaveNote rest), not an invisible GhostNote spacer,
		// and it keeps the slot's own rhythmic value (an eighth rest → duration "8").
		expect(notes[0]).toBeInstanceOf(StaveNote);
		expect(notes[0]).not.toBeInstanceOf(GhostNote);
		expect(notes[0].getDuration()).toBe("8");
	});

	it("a dotted-quarter rest constructs without throwing (VexFlow accepts the 'qdr' string)", () => {
		// The dotted-note duration string ("qd") plus the rest suffix → "qdr". VexFlow
		// parses it to a quarter rest; the dot glyph itself isn't rendered here (this
		// codebase never attaches Dot modifiers — dotted NOTES behave the same way).
		const { notes } = fingerpickToVexFlow(
			measure([{ ...beatSlot("s1", "dotted-quarter"), isRest: true }])
		);
		expect(notes).toHaveLength(1);
		expect(notes[0]).toBeInstanceOf(StaveNote);
		expect(notes[0].getDuration()).toBe("q");
	});
});

describe("fingerpickToVexFlow — single note", () => {
	it("one active string produces a TabNote with no connectors", () => {
		const { notes, connectors } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 5: { fret: 0 } })])
		);
		expect(notes).toHaveLength(1);
		expect(notes[0]).toBeInstanceOf(TabNote);
		expect(connectors).toHaveLength(0);
	});

	it("string index 5 (low E) maps to VexFlow str=6 with correct fret", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 5: { fret: 3 } })])
		);
		const positions = (notes[0] as TabNote).getPositions();
		expect(positions).toEqual([{ str: 6, fret: 3 }]);
	});

	it("string index 0 (high e) maps to VexFlow str=1", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 7 } })])
		);
		const positions = (notes[0] as TabNote).getPositions();
		expect(positions).toEqual([{ str: 1, fret: 7 }]);
	});

	it("muted string uses fret 'x'", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { muted: true } })])
		);
		const positions = (notes[0] as TabNote).getPositions();
		expect(positions).toEqual([{ str: 1, fret: "x" }]);
	});

	it("multiple active strings in one slot all appear in positions", () => {
		const { notes } = fingerpickToVexFlow(
			measure([
				beatSlot("s1", "quarter", {
					0: { fret: 0 },
					2: { fret: 2 },
					4: { fret: 0 },
				}),
			])
		);
		expect(notes).toHaveLength(1);
		expect((notes[0] as TabNote).getPositions()).toHaveLength(3);
	});
});

describe("fingerpickToVexFlow — technique modifiers", () => {
	it("hammer-on produces a TabTie connector", () => {
		const { notes, connectors } = fingerpickToVexFlow(
			measure([
				beatSlot("s1", "quarter", { 0: { fret: 0 } }),
				beatSlot("s2", "quarter", { 0: { fret: 2, technique: "hammer-on" } }),
			])
		);
		expect(notes).toHaveLength(2);
		expect(connectors).toHaveLength(1);
		expect(connectors[0]).toBeInstanceOf(TabTie);
	});

	it("pull-off produces a TabTie connector", () => {
		const { connectors } = fingerpickToVexFlow(
			measure([
				beatSlot("s1", "quarter", { 1: { fret: 5 } }),
				beatSlot("s2", "quarter", { 1: { fret: 3, technique: "pull-off" } }),
			])
		);
		expect(connectors).toHaveLength(1);
		expect(connectors[0]).toBeInstanceOf(TabTie);
	});

	it("slide-up produces a TabSlide connector", () => {
		const { connectors } = fingerpickToVexFlow(
			measure([
				beatSlot("s1", "quarter", { 2: { fret: 3 } }),
				beatSlot("s2", "quarter", { 2: { fret: 5, technique: "slide-up" } }),
			])
		);
		expect(connectors).toHaveLength(1);
		expect(connectors[0]).toBeInstanceOf(TabSlide);
	});

	it("slide-down produces a TabSlide connector", () => {
		const { connectors } = fingerpickToVexFlow(
			measure([
				beatSlot("s1", "quarter", { 3: { fret: 7 } }),
				beatSlot("s2", "quarter", { 3: { fret: 5, technique: "slide-down" } }),
			])
		);
		expect(connectors).toHaveLength(1);
		expect(connectors[0]).toBeInstanceOf(TabSlide);
	});

	it("tied note produces a TabTie connector", () => {
		const { connectors } = fingerpickToVexFlow(
			measure([
				beatSlot("s1", "quarter", { 4: { fret: 2 } }),
				beatSlot("s2", "quarter", { 4: { fret: 2, tied: true } }),
			])
		);
		expect(connectors).toHaveLength(1);
		expect(connectors[0]).toBeInstanceOf(TabTie);
	});

	it("adjacent notes with no technique and not tied produce no connector", () => {
		const { connectors } = fingerpickToVexFlow(
			measure([
				beatSlot("s1", "quarter", { 0: { fret: 0 } }),
				beatSlot("s2", "quarter", { 0: { fret: 2 } }),
			])
		);
		expect(connectors).toHaveLength(0);
	});
});

// ─── Beam grouping ────────────────────────────────────────────────────────────

describe("beam grouping via Beam.applyAndGetBeams", () => {
	it("quarter notes produce no beams", () => {
		const { notes } = fingerpickToVexFlow(
			measure([
				beatSlot("s1", "quarter", { 0: { fret: 0 } }),
				beatSlot("s2", "quarter", { 0: { fret: 0 } }),
				beatSlot("s3", "quarter", { 0: { fret: 0 } }),
				beatSlot("s4", "quarter", { 0: { fret: 0 } }),
			])
		);
		const beams = Beam.applyAndGetBeams(voiceFrom(notes), -1);
		expect(beams).toHaveLength(0);
	});

	it("two consecutive eighth notes produce one beam group", () => {
		const { notes } = fingerpickToVexFlow(
			measure([
				beatSlot("s1", "eighth", { 0: { fret: 0 } }),
				beatSlot("s2", "eighth", { 0: { fret: 0 } }),
			])
		);
		const beams = Beam.applyAndGetBeams(voiceFrom(notes), -1);
		expect(beams).toHaveLength(1);
	});

	it("mixed quarter and eighth notes beam only the consecutive eighths", () => {
		const { notes } = fingerpickToVexFlow(
			measure([
				beatSlot("s1", "quarter", { 0: { fret: 0 } }),
				beatSlot("s2", "eighth", { 0: { fret: 0 } }),
				beatSlot("s3", "eighth", { 0: { fret: 0 } }),
			])
		);
		const beams = Beam.applyAndGetBeams(voiceFrom(notes), -1);
		expect(beams).toHaveLength(1);
	});
});

// ─── New Duration values ──────────────────────────────────────────────────────

describe("VEX_DURATION — new Duration values", () => {
	it.each([
		["32nd", "32"],
		["dotted-quarter", "qd"],
		["dotted-eighth", "8d"],
		["eighth-triplet", "8"],
		["sixteenth-triplet", "16"],
	] as const)('maps "%s" → "%s"', (dur, expected) => {
		expect(VEX_DURATION[dur]).toBe(expected);
	});
});

// ─── New Technique values ─────────────────────────────────────────────────────

describe("fingerpickToVexFlow — new technique values", () => {
	const newTechniques: Technique[] = [
		"bend-full", "bend-half", "bend-quarter", "bend-release",
		"pre-bend", "pre-bend-release", "vibrato", "vibrato-wide",
		"vibrato-bar", "tapping", "trill", "harmonic-natural",
		"harmonic-artificial", "whammy-dive", "whammy-pull",
		"pick-scrape", "grace-note",
	];

	it.each(newTechniques)("technique %s does not throw", (technique) => {
		expect(() =>
			fingerpickToVexFlow(
				measure([
					beatSlot("s1", "quarter", { 0: { fret: 0 } }),
					beatSlot("s2", "quarter", { 0: { fret: 2, technique } }),
				])
			)
		).not.toThrow();
	});
});

// ─── isGraceNote ──────────────────────────────────────────────────────────────

describe("fingerpickToVexFlow — isGraceNote", () => {
	it("isGraceNote slot is excluded from notes[] and attaches a GraceNoteGroup of GraceTabNotes to the following TabNote", () => {
		const graceSlot: BeatSlot = {
			id: "g1",
			duration: "eighth",
			strings: strings6({ 0: { fret: 5 } }),
			isGraceNote: true,
		};
		const { notes } = fingerpickToVexFlow(
			measure([graceSlot, beatSlot("s1", "eighth", { 0: { fret: 7 } })])
		);
		expect(notes).toHaveLength(1);
		expect(notes[0]).toBeInstanceOf(TabNote);
		const modifiers = (notes[0] as TabNote).getModifiers();
		const group = modifiers.find((m) => m instanceof GraceNoteGroup) as GraceNoteGroup | undefined;
		expect(group).toBeDefined();
		expect(group!.getGraceNotes()[0]).toBeInstanceOf(GraceTabNote);
	});
});

// ─── Tuplet grouping ──────────────────────────────────────────────────────────

describe("fingerpickToVexFlow — eighth-triplet tuplets", () => {
	it("three consecutive eighth-triplet slots produce one Tuplet", () => {
		const { tuplets } = fingerpickToVexFlow(
			measure([
				beatSlot("t1", "eighth-triplet", { 0: { fret: 5 } }),
				beatSlot("t2", "eighth-triplet", { 0: { fret: 7 } }),
				beatSlot("t3", "eighth-triplet", { 0: { fret: 9 } }),
			])
		);
		expect(tuplets).toHaveLength(1);
	});

	it("six consecutive eighth-triplet slots produce two Tuplets", () => {
		const { tuplets } = fingerpickToVexFlow(
			measure([
				beatSlot("t1", "eighth-triplet", { 0: { fret: 5 } }),
				beatSlot("t2", "eighth-triplet", { 0: { fret: 7 } }),
				beatSlot("t3", "eighth-triplet", { 0: { fret: 9 } }),
				beatSlot("t4", "eighth-triplet", { 0: { fret: 5 } }),
				beatSlot("t5", "eighth-triplet", { 0: { fret: 7 } }),
				beatSlot("t6", "eighth-triplet", { 0: { fret: 9 } }),
			])
		);
		expect(tuplets).toHaveLength(2);
	});

	it("three consecutive sixteenth-triplet slots produce one Tuplet", () => {
		const { tuplets } = fingerpickToVexFlow(
			measure([
				beatSlot("t1", "sixteenth-triplet", { 0: { fret: 5 } }),
				beatSlot("t2", "sixteenth-triplet", { 0: { fret: 7 } }),
				beatSlot("t3", "sixteenth-triplet", { 0: { fret: 9 } }),
			])
		);
		expect(tuplets).toHaveLength(1);
	});
});

// ─── Note modifiers (B1) ──────────────────────────────────────────────────────

describe("fingerpickToVexFlow — note modifiers", () => {
	it("staccato: true attaches an Annotation modifier to the TabNote", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, staccato: true } })])
		);
		expect(notes[0]).toBeInstanceOf(TabNote);
		expect(notes[0].getModifiers().some((m) => m instanceof Annotation)).toBe(true);
	});

	it("accent: true attaches an Annotation modifier to the TabNote", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, accent: true } })])
		);
		expect(notes[0].getModifiers().some((m) => m instanceof Annotation)).toBe(true);
	});

	it("pickStroke: 'down' attaches an Annotation modifier to the TabNote", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, pickStroke: "down" } })])
		);
		expect(notes[0].getModifiers().some((m) => m instanceof Annotation)).toBe(true);
	});

	it("pickStroke: 'up' attaches an Annotation modifier to the TabNote", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, pickStroke: "up" } })])
		);
		expect(notes[0].getModifiers().some((m) => m instanceof Annotation)).toBe(true);
	});

	it("tremoloPickingSpeed: '8th' attaches a Tremolo(1) modifier", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, tremoloPickingSpeed: "8th" } })])
		);
		const tremolo = notes[0].getModifiers().find((m) => m instanceof Tremolo) as
			| (Tremolo & { num: number })
			| undefined;
		expect(tremolo).toBeDefined();
		expect(tremolo!.num).toBe(1);
	});

	it("tremoloPickingSpeed: '16th' attaches a Tremolo(2) modifier", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, tremoloPickingSpeed: "16th" } })])
		);
		const tremolo = notes[0].getModifiers().find((m) => m instanceof Tremolo) as
			| (Tremolo & { num: number })
			| undefined;
		expect(tremolo).toBeDefined();
		expect(tremolo!.num).toBe(2);
	});

	it("tremoloPickingSpeed: '32nd' attaches a Tremolo(3) modifier", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, tremoloPickingSpeed: "32nd" } })])
		);
		const tremolo = notes[0].getModifiers().find((m) => m instanceof Tremolo) as
			| (Tremolo & { num: number })
			| undefined;
		expect(tremolo).toBeDefined();
		expect(tremolo!.num).toBe(3);
	});

	// Vibrato constructor calls setVibratoWidth() which needs a real canvas context;
	// in jsdom getWidth() returns 0 and throws. These tests require a browser-native runner.
	it.skip("technique 'vibrato' attaches a Vibrato modifier to the TabNote [needs canvas]", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, technique: "vibrato" } })])
		);
		expect(notes[0].getModifiers().some((m) => m instanceof Vibrato)).toBe(true);
	});

	it.skip("technique 'vibrato-wide' attaches a Vibrato modifier with width > 20 [needs canvas]", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, technique: "vibrato-wide" } })])
		);
		const vibrato = notes[0].getModifiers().find((m) => m instanceof Vibrato) as
			| (Vibrato & { renderOptions: { width: number } })
			| undefined;
		expect(vibrato).toBeDefined();
		expect(vibrato!.renderOptions.width).toBeGreaterThan(20);
	});
});

// ─── Slot-level roll ────────────────────────────────────────────────────────────
// The `letRing` field previously shipped passing 542 tests while being silently
// dropped by the adapter. These assert the roll is actually reported — a slot with
// a stroke produces a RollMark for its note, one without produces none.

describe("fingerpickToVexFlow — slot stroke (roll)", () => {
	it("roll-down and roll-up are reported against the note, with their direction", () => {
		const down = fingerpickToVexFlow(
			measure([{ ...beatSlot("s1", "quarter", { 0: { fret: 5 } }), stroke: "roll-down" }])
		);
		expect(down.notes[0]).toBeInstanceOf(TabNote);
		expect(down.rolls).toEqual([{ noteIndex: 0, stroke: "roll-down" }]);
		const up = fingerpickToVexFlow(
			measure([{ ...beatSlot("s1", "quarter", { 0: { fret: 5 } }), stroke: "roll-up" }])
		);
		expect(up.rolls).toEqual([{ noteIndex: 0, stroke: "roll-up" }]);
	});

	it("brush strokes are reported the same way", () => {
		const { rolls } = fingerpickToVexFlow(
			measure([{ ...beatSlot("s1", "quarter", { 0: { fret: 5 } }), stroke: "brush-up" }])
		);
		expect(rolls).toEqual([{ noteIndex: 0, stroke: "brush-up" }]);
	});

	it("a slot with no stroke produces no roll, and the note carries no VexFlow Stroke", () => {
		const { notes, rolls } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5 } })])
		);
		expect(rolls).toEqual([]);
		expect(notes[0].getModifiers().some((m) => m instanceof Stroke)).toBe(false);
	});

	it("a roll on a gapped chord is still one roll, indexed to the right note", () => {
		const { rolls } = fingerpickToVexFlow(
			measure([
				beatSlot("s0", "quarter", { 2: { fret: 1 } }),
				{ ...beatSlot("s1", "quarter", { 0: { fret: 5 }, 4: { fret: 3 } }), stroke: "roll-up" },
			])
		);
		expect(rolls).toEqual([{ noteIndex: 1, stroke: "roll-up" }]);
	});
});

// ─── Chord labels ─────────────────────────────────────────────────────────────

describe("chord labels", () => {
	const C = { root: "C", suffix: "major" };
	const Am = { root: "A", suffix: "minor" };

	it("emits nothing for a measure without marks", () => {
		const { chordLabels } = fingerpickToVexFlow(
			measure([beatSlot("a", "quarter", { 0: { fret: 3 } })]),
		);
		expect(chordLabels).toEqual([]);
	});

	it("writes the symbol over the note where the chord changes", () => {
		const { chordLabels } = fingerpickToVexFlow(
			measure([
				{ ...beatSlot("a", "quarter", { 0: { fret: 3 } }), chord: C },
				beatSlot("b", "quarter", { 1: { fret: 2 } }),
				{ ...beatSlot("c", "quarter", { 2: { fret: 0 } }), chord: Am },
				beatSlot("d", "quarter"),
			]),
		);
		expect(chordLabels).toEqual([
			{ noteIndex: 0, slotIndex: 0, chord: C, label: "C" },
			{ noteIndex: 2, slotIndex: 2, chord: Am, label: "Am" },
		]);
	});

	it("an empty slot and a rest can each start a chord", () => {
		const { notes, chordLabels } = fingerpickToVexFlow(
			measure([
				{ ...beatSlot("a", "quarter"), chord: C },
				{ ...beatSlot("b", "quarter"), isRest: true, chord: Am },
			]),
		);
		expect(notes[0]).toBeInstanceOf(GhostNote);
		expect(notes[1]).toBeInstanceOf(StaveNote);
		expect(chordLabels).toEqual([
			{ noteIndex: 0, slotIndex: 0, chord: C, label: "C" },
			{ noteIndex: 1, slotIndex: 1, chord: Am, label: "Am" },
		]);
	});

	it("a mark on a grace-note slot is written at the note it resolves into", () => {
		const { notes, chordLabels } = fingerpickToVexFlow(
			measure([
				beatSlot("a", "quarter", { 0: { fret: 3 } }),
				{ ...beatSlot("g", "eighth", { 1: { fret: 2 } }), isGraceNote: true, chord: Am },
				beatSlot("b", "quarter", { 1: { fret: 3 } }),
			]),
		);
		// The grace slot produced no tickable, so the label indexes the main note.
		expect(notes).toHaveLength(2);
		expect(chordLabels).toEqual([{ noteIndex: 1, slotIndex: 1, chord: Am, label: "Am" }]);
	});
});

// ─── Note → string / slot maps ───────────────────────────────────────────────

describe("noteStrings / noteSlots", () => {
	it("lists each note's strings in position order, and maps notes back to slots", () => {
		const { notes, noteStrings, noteSlots } = fingerpickToVexFlow(
			measure([
				beatSlot("a", "quarter", { 4: { fret: 3 }, 1: { fret: 1 } }),
				{ ...beatSlot("g", "eighth", { 2: { fret: 2 } }), isGraceNote: true },
				beatSlot("b", "quarter"),
				{ ...beatSlot("r", "quarter"), isRest: true },
			]),
		);
		expect(notes).toHaveLength(3);
		expect(noteStrings).toEqual([[1, 4], [], []]);
		expect(noteSlots).toEqual([0, 2, 3]);
	});
});
