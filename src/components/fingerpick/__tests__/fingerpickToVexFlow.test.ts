import { describe, it, expect } from "vitest";
import {
	TabNote,
	GhostNote,
	TabTie,
	TabSlide,
	Voice,
	Beam,
	GraceNoteGroup,
	Annotation,
	Tremolo,
	Vibrato,
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
		["rest", "q"],
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

	it("rest slot becomes a GhostNote regardless of string data", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "rest", { 0: { fret: 5 } })])
		);
		expect(notes).toHaveLength(1);
		expect(notes[0]).toBeInstanceOf(GhostNote);
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
	it("isGraceNote slot is excluded from notes[] and attaches a GraceNoteGroup to the following TabNote", () => {
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
		expect(modifiers.some((m) => m instanceof GraceNoteGroup)).toBe(true);
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
