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
	TabStave,
} from "vexflow";

import { tripletGroups } from "@/lib/fingerpickEdit";
import {
	beamGroupsFor,
	bendHeightLabel,
	bendMarkForEffect,
	bracketSpans,
	fingerpickToVexFlow,
	RENDER_KINDS,
	VEX_DURATION,
} from "@/lib/fingerpickToVexFlow";
import type { BeatSlot, FingerpickPattern, Measure, StringFret, Duration, Technique } from "@/lib/fingerpickTypes";
import { migratePattern } from "@/lib/tabImport";
import { indexPattern } from "@/lib/fingerpickIndex";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function strings6(
	overrides: Record<number, Partial<StringFret>> = {}
): [StringFret, StringFret, StringFret, StringFret, StringFret, StringFret] {
	const make = (i: number): StringFret => ({
		fret: null,
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

/** The index of measures read as a pattern, their bracket flags folded to spans by the migrator. */
function indexOf(...measures: Measure[]) {
	return indexPattern(migratePattern({ id: "p", name: "p", bpm: 100, timeSignature: [4, 4], measures }) as FingerpickPattern);
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
				beatSlot("s2", "quarter", { 0: { fret: 2, link: { kind: "hammer" } } }),
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
				beatSlot("s2", "quarter", { 1: { fret: 3, link: { kind: "pull" } } }),
			])
		);
		expect(connectors).toHaveLength(1);
		expect(connectors[0]).toBeInstanceOf(TabTie);
	});

	it("slide-up produces a TabSlide connector", () => {
		const { connectors } = fingerpickToVexFlow(
			measure([
				beatSlot("s1", "quarter", { 2: { fret: 3 } }),
				beatSlot("s2", "quarter", { 2: { fret: 5, link: { kind: "slide" } } }),
			])
		);
		expect(connectors).toHaveLength(1);
		expect(connectors[0]).toBeInstanceOf(TabSlide);
	});

	it("slide-down produces a TabSlide connector", () => {
		const { connectors } = fingerpickToVexFlow(
			measure([
				beatSlot("s1", "quarter", { 3: { fret: 7 } }),
				beatSlot("s2", "quarter", { 3: { fret: 5, link: { kind: "slide" } } }),
			])
		);
		expect(connectors).toHaveLength(1);
		expect(connectors[0]).toBeInstanceOf(TabSlide);
	});

	it("tied note produces a TabTie connector", () => {
		const { connectors } = fingerpickToVexFlow(
			measure([
				beatSlot("s1", "quarter", { 4: { fret: 2 } }),
				beatSlot("s2", "quarter", { 4: { fret: 2, link: { kind: "tie" } } }),
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

// ─── Bends ───────────────────────────────────────────────────────────────────

describe("bendHeightLabel", () => {
	it("writes the heights tab readers expect, defaulting to a full bend", () => {
		expect(bendHeightLabel(2)).toBe("Full");
		expect(bendHeightLabel(1)).toBe("1/2");
		expect(bendHeightLabel(0.5)).toBe("1/4");
		expect(bendHeightLabel(1.5)).toBe("1 1/2");
		expect(bendHeightLabel(3)).toBe("3");
		expect(bendHeightLabel(undefined)).toBe("Full");
		expect(bendHeightLabel(0)).toBe("Full");
	});
});

describe("fingerpickToVexFlow — bends", () => {
	it("counts the notes carrying a bend or vibrato, for the width pass", () => {
		const rd = fingerpickToVexFlow(
			measure([
				beatSlot("s1", "quarter", { 2: { fret: 7, effects: { bend: { semitones: 2 } } } }),
				beatSlot("s2", "quarter", { 2: { fret: 7 } }),
				beatSlot("s3", "quarter", { 2: { fret: 7, effects: { bend: { semitones: 2.0, pre: true, release: true } } } }),
				beatSlot("s4", "quarter", { 0: { fret: 3, effects: { bend: { semitones: 1 } } }, 2: { fret: 7, effects: { bend: { semitones: 2 } } } }),
			])
		);
		expect(rd.expression).toEqual({ bends: 3, vibratos: 0, wideVibratos: 0 });
		expect(fingerpickToVexFlow(measure([beatSlot("s1", "quarter", { 2: { fret: 7 } })])).expression).toEqual({ bends: 0, vibratos: 0, wideVibratos: 0 });
		const vib = fingerpickToVexFlow(
			measure([
				beatSlot("v1", "half", { 2: { fret: 7, effects: { vibrato: {} } } }),
				beatSlot("v2", "half", { 2: { fret: 7, effects: { vibrato: { wide: true } } } }),
			])
		);
		expect(vib.expression).toEqual({ bends: 0, vibratos: 1, wideVibratos: 1 });
	});

	it("a pre-bend writes its PB label as an annotation on the note", () => {
		const rd = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 2: { fret: 7, effects: { bend: { semitones: 1.0, pre: true } } } })])
		);
		const annotations = (rd.notes[0] as TabNote).getModifiers().filter((m) => m instanceof Annotation) as Annotation[];
		expect(annotations.map((a) => a.getText())).toContain("PB 1/2");
	});
});

// ─── Brackets ────────────────────────────────────────────────────────────────

describe("bracketSpans", () => {
	const pm = (fret: number): Partial<StringFret> => ({ fret, palmMute: true });
	const lr = (fret: number): Partial<StringFret> => ({ fret, letRing: true });

	it("one bracket per run; a plain note breaks the run", () => {
		const m = measure([
			beatSlot("s0", "eighth", { 4: pm(0) }),
			beatSlot("s1", "eighth", { 4: pm(0) }),
			beatSlot("s2", "eighth", { 4: { fret: 0 } }),
			beatSlot("s3", "eighth", { 4: pm(2) }),
		]);
		expect(bracketSpans(m, [0, 1, 2, 3], indexOf(m))).toEqual([
			{ kind: "palm-mute", fromNoteIndex: 0, toNoteIndex: 1 },
			{ kind: "palm-mute", fromNoteIndex: 3, toNoteIndex: 3 },
		]);
	});

	it("palm mute and let ring are separate brackets, even on the same notes", () => {
		const m = measure([
			beatSlot("s0", "quarter", { 5: { fret: 3, palmMute: true, letRing: true } }),
			beatSlot("s1", "quarter", { 1: lr(3) }),
		]);
		expect(bracketSpans(m, [0, 1], indexOf(m))).toEqual([
			{ kind: "palm-mute", fromNoteIndex: 0, toNoteIndex: 0 },
			{ kind: "let-ring", fromNoteIndex: 0, toNoteIndex: 1 },
		]);
	});

	it("a rest and an empty slot end a run; a grace slot is transparent", () => {
		const m = measure([
			beatSlot("s0", "quarter", { 0: lr(0) }),
			{ ...beatSlot("g", "sixteenth", { 0: { fret: 2 } }), isGraceNote: true },
			beatSlot("s1", "quarter", { 0: lr(0) }),
			{ ...beatSlot("r", "quarter"), isRest: true },
			beatSlot("s2", "quarter", { 0: lr(0) }),
			beatSlot("e", "quarter"),
			beatSlot("s3", "quarter", { 0: lr(0) }),
		]);
		// Note indexes as the converter assigns them: the grace slot has none.
		expect(bracketSpans(m, [0, null, 1, 2, 3, 4, 5], indexOf(m))).toEqual([
			{ kind: "let-ring", fromNoteIndex: 0, toNoteIndex: 1 },
			{ kind: "let-ring", fromNoteIndex: 3, toNoteIndex: 3 },
			{ kind: "let-ring", fromNoteIndex: 5, toNoteIndex: 5 },
		]);
	});

	it("a flag on a silent string does not count", () => {
		const m = measure([beatSlot("s0", "quarter", { 0: { fret: 5 }, 3: { fret: null, letRing: true } })]);
		expect(bracketSpans(m, [0], indexOf(m))).toEqual([]);
	});

	it("the converter returns the spans with its own note indexes", () => {
		const m = measure([
			beatSlot("s0", "quarter", { 0: lr(0) }),
			{ ...beatSlot("g", "sixteenth", { 0: { fret: 2 } }), isGraceNote: true },
			beatSlot("s1", "quarter", { 0: lr(0) }),
			beatSlot("s2", "half", { 0: { fret: 0 } }),
		]);
		const rd = fingerpickToVexFlow(m, { index: indexOf(m) });
		expect(rd.brackets).toEqual([{ kind: "let-ring", fromNoteIndex: 0, toNoteIndex: 1 }]);
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

// ─── Beam groups ──────────────────────────────────────────────────────────────

describe("beamGroupsFor", () => {
	it("beams simple meters by the quarter and compound meters by the dotted quarter", () => {
		for (const ts of [[4, 4], [3, 4], [2, 4]] as const) {
			const [g] = beamGroupsFor(ts);
			expect(beamGroupsFor(ts)).toHaveLength(1);
			expect(g.numerator / g.denominator).toBe(1 / 4);
		}
		for (const ts of [[6, 8], [12, 8]] as const) {
			const [g] = beamGroupsFor(ts);
			expect(g.numerator / g.denominator).toBe(3 / 8);
		}
	});

	it("groups six eighths in 3/4 as 2+2+2 and in 6/8 as 3+3", () => {
		const eighths = Array.from({ length: 6 }, (_, i) => beatSlot(`e${i}`, "eighth", { 0: { fret: 0 } }));
		const beamsIn = (ts: [number, number]) => {
			const { notes } = fingerpickToVexFlow(measure(eighths));
			const voice = new Voice({ numBeats: ts[0], beatValue: ts[1] }).setMode(Voice.Mode.SOFT);
			voice.addTickables(notes);
			return Beam.applyAndGetBeams(voice, -1, beamGroupsFor(ts)).map((b) => b.getNotes().length);
		};
		expect(beamsIn([3, 4])).toEqual([2, 2, 2]);
		expect(beamsIn([6, 8])).toEqual([3, 3]);
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

	it("a 4/4 bar of twelve eighth-triplets renders four Tuplet brackets, one per group", () => {
		const slots = Array.from({ length: 12 }, (_, i) =>
			beatSlot(`t${i}`, "eighth-triplet", { 0: { fret: i % 3 } }),
		);
		const { tuplets } = fingerpickToVexFlow(measure(slots));
		expect(tuplets).toHaveLength(4);
		expect(tripletGroups(slots).map((g) => g.start)).toEqual([0, 3, 6, 9]);
	});

	it("a tuplet of empty slots can be positioned: ghost notes answer for a stem", () => {
		// A bar just filled from the All row is three empty triplet slots; VexFlow
		// positions the bracket from each rest's stem and a plain GhostNote has none.
		const { notes, tuplets } = fingerpickToVexFlow(
			measure([
				beatSlot("t1", "eighth-triplet", {}),
				beatSlot("t2", "eighth-triplet", { 0: { fret: 5 } }),
				beatSlot("t3", "eighth-triplet", {}),
			]),
		);
		expect(notes[0]).toBeInstanceOf(GhostNote);
		const stave = new TabStave(0, 0, 300);
		notes.forEach((n) => n.setStave(stave));
		expect(tuplets).toHaveLength(1);
		expect(() => tuplets[0].getYPosition()).not.toThrow();
	});

	it("a leftover triplet after a group gets no bracket, matching tripletGroups", () => {
		const slots = Array.from({ length: 4 }, (_, i) =>
			beatSlot(`t${i}`, "eighth-triplet", { 0: { fret: 5 } }),
		);
		const { tuplets } = fingerpickToVexFlow(measure(slots));
		expect(tuplets).toHaveLength(tripletGroups(slots).length);
		expect(tuplets).toHaveLength(1);
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
	it("a staccato effect attaches an Annotation modifier to the TabNote", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, effects: { staccato: true } } })])
		);
		expect(notes[0]).toBeInstanceOf(TabNote);
		expect(notes[0].getModifiers().some((m) => m instanceof Annotation)).toBe(true);
	});

	it("accent: true attaches an Annotation modifier to the TabNote", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, effects: { accent: true } } })])
		);
		expect(notes[0].getModifiers().some((m) => m instanceof Annotation)).toBe(true);
	});

	it("pickStroke: 'down' attaches an Annotation modifier to the TabNote", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, effects: { pick: { direction: "down" } } } })])
		);
		expect(notes[0].getModifiers().some((m) => m instanceof Annotation)).toBe(true);
	});

	it("pickStroke: 'up' attaches an Annotation modifier to the TabNote", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, effects: { pick: { direction: "up" } } } })])
		);
		expect(notes[0].getModifiers().some((m) => m instanceof Annotation)).toBe(true);
	});

	it("tremoloPickingSpeed: '8th' attaches a Tremolo(1) modifier", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, effects: { tremolo: { speed: "8th" } } } })])
		);
		const tremolo = notes[0].getModifiers().find((m) => m instanceof Tremolo) as
			| (Tremolo & { num: number })
			| undefined;
		expect(tremolo).toBeDefined();
		expect(tremolo!.num).toBe(1);
	});

	it("tremoloPickingSpeed: '16th' attaches a Tremolo(2) modifier", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, effects: { tremolo: { speed: "16th" } } } })])
		);
		const tremolo = notes[0].getModifiers().find((m) => m instanceof Tremolo) as
			| (Tremolo & { num: number })
			| undefined;
		expect(tremolo).toBeDefined();
		expect(tremolo!.num).toBe(2);
	});

	it("tremoloPickingSpeed: '32nd' attaches a Tremolo(3) modifier", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, effects: { tremolo: { speed: "32nd" } } } })])
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
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, effects: { vibrato: {} } } })])
		);
		expect(notes[0].getModifiers().some((m) => m instanceof Vibrato)).toBe(true);
	});

	it.skip("technique 'vibrato-wide' attaches a Vibrato modifier with width > 20 [needs canvas]", () => {
		const { notes } = fingerpickToVexFlow(
			measure([beatSlot("s1", "quarter", { 0: { fret: 5, effects: { vibrato: { wide: true } } } })])
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

// ─── Model v2 ─────────────────────────────────────────────────────────────────

describe("fingerpickToVexFlow — model v2", () => {
	const v2 = (slots: BeatSlot[], over: Partial<FingerpickPattern> = {}): FingerpickPattern => ({
		id: "p",
		name: "p",
		bpm: 100,
		timeSignature: [4, 4],
		schemaVersion: 2,
		measures: [{ id: "m1", slots }],
		...over,
	});
	const ctx = (p: FingerpickPattern) => ({ index: indexPattern(p) });

	it("links draw their connectors, a slide's direction read from the frets", () => {
		const p = v2([
			beatSlot("s1", "quarter", { 0: { fret: 5 }, 2: { fret: 7 } }),
			beatSlot("s2", "quarter", { 0: { fret: 7, link: { kind: "hammer" } }, 2: { fret: 5, link: { kind: "slide" } } }),
			beatSlot("s3", "quarter", { 0: { fret: 7, link: { kind: "tie" } }, 2: { fret: 5, link: { kind: "pull" } } }),
		]);
		const rd = fingerpickToVexFlow(p.measures[0], ctx(p));
		expect(rd.connectors.map((c) => c.constructor.name)).toEqual(["TabTie", "TabSlide", "TabTie", "TabTie"]);
		expect(rd.leadIns).toEqual([]);
	});

	it("effects draw their marks: a bend from its parameters, a ghost in parentheses, a harmonic by its letters", () => {
		const p = v2([
			beatSlot("s1", "quarter", { 2: { fret: 7, effects: { bend: { semitones: 1, release: true, hold: true }, accent: true } } }),
			beatSlot("s2", "quarter", { 2: { fret: 7, effects: { ghost: true } } }),
			beatSlot("s3", "quarter", { 2: { fret: 12, effects: { harmonic: { type: "natural" } } } }),
			beatSlot("s4", "quarter", { 2: { fret: 7, effects: { vibrato: { wide: true }, tremolo: { speed: "16th" } } } }),
		]);
		const rd = fingerpickToVexFlow(p.measures[0], ctx(p));
		expect(rd.expression).toEqual({ bends: 1, vibratos: 0, wideVibratos: 1 });
		expect(rd.holds).toEqual([0]);
		const texts = (i: number) =>
			(rd.notes[i] as TabNote).getModifiers().filter((m) => m instanceof Annotation).map((m) => (m as Annotation).getText());
		expect(texts(0)).toContain(">");
		expect((rd.notes[1] as TabNote).getPositions()[0].fret).toBe("(7)");
		expect(texts(2)).toContain("N.H.");
		expect(rd.notes[3].getModifiers().some((m) => m instanceof Tremolo)).toBe(true);
	});

	it("a hit is reported over its note, with the registry's letter, even on a silent slot", () => {
		const p = v2([
			beatSlot("s1", "quarter", { 4: { fret: 0 } }),
			{ ...beatSlot("s2", "quarter", { 0: { fret: null, muted: true } }), percussion: { kind: "slap" } },
			{ ...beatSlot("s3", "quarter"), percussion: { kind: "bodyTap" } },
			{ ...beatSlot("s4", "quarter"), isRest: true, percussion: { kind: "thumbSlap" } },
		]);
		const rd = fingerpickToVexFlow(p.measures[0], ctx(p));
		expect(rd.hits).toEqual([
			{ noteIndex: 1, kind: "slap", label: "S" },
			{ noteIndex: 2, kind: "bodyTap", label: "B" },
			{ noteIndex: 3, kind: "thumbSlap", label: "T" },
		]);
	});

	it("brackets come from the spans, one segment per measure, saying whether they continue", () => {
		const p: FingerpickPattern = {
			...v2([]),
			measures: [
				{ id: "m1", slots: [beatSlot("a", "half", { 4: { fret: 0 } }), beatSlot("b", "half", { 4: { fret: 0 } })] },
				{ id: "m2", slots: [beatSlot("c", "half", { 4: { fret: 2 } }), beatSlot("d", "half", { 4: { fret: 2 } })] },
			],
			spans: [{ id: "pm", kind: "palmMute", from: "b", to: "c" }],
		};
		const first = fingerpickToVexFlow(p.measures[0], ctx(p));
		const second = fingerpickToVexFlow(p.measures[1], ctx(p));
		expect(first.brackets).toEqual([{ kind: "palm-mute", fromNoteIndex: 1, toNoteIndex: 1, continuesAfter: true }]);
		expect(second.brackets).toEqual([{ kind: "palm-mute", fromNoteIndex: 0, toNoteIndex: 0, continuesBefore: true }]);
	});

	it("a span over some strings only brackets the notes on them", () => {
		const p = v2([beatSlot("a", "quarter", { 0: { fret: 3 }, 4: { fret: 0 } }), beatSlot("b", "quarter", { 4: { fret: 0 } })], {
			spans: [{ id: "lr", kind: "letRing", from: "a", to: "b", strings: [0] }],
		});
		const rd = fingerpickToVexFlow(p.measures[0], ctx(p));
		expect(rd.brackets).toEqual([{ kind: "let-ring", fromNoteIndex: 0, toNoteIndex: 0 }]);
	});

	it("a link on a measure's first note reaches back across the barline as a lead-in", () => {
		const p: FingerpickPattern = {
			...v2([]),
			measures: [
				{ id: "m1", slots: [beatSlot("a", "whole", { 2: { fret: 5 } })] },
				{ id: "m2", slots: [beatSlot("b", "whole", { 2: { fret: 7, link: { kind: "hammer" } }, 0: { fret: 3, link: { kind: "slide" } } })] },
			],
		};
		const second = fingerpickToVexFlow(p.measures[1], ctx(p));
		expect(second.connectors).toEqual([]);
		expect(second.leadIns).toEqual([
			{ noteIndex: 0, stringIndex: 0, kind: "slide" },
			{ noteIndex: 0, stringIndex: 2, kind: "hammer" },
		]);
		// The pattern's first measure has nothing before it.
		expect(fingerpickToVexFlow(p.measures[0], ctx(p)).leadIns).toEqual([]);
		// Without a context the measure is read on its own: no lead-in either.
		expect(fingerpickToVexFlow(p.measures[1]).leadIns).toEqual([]);
	});


	it("bendMarkForEffect writes the height, the pre-bend label and the release arrow", () => {
		expect(bendMarkForEffect({ semitones: 1.5 })).toEqual({ phrase: [{ type: "up", text: "1 1/2" }] });
		expect(bendMarkForEffect({ semitones: 0.5, pre: true })).toEqual({ phrase: [], preBendLabel: "PB 1/4" });
		expect(bendMarkForEffect({ semitones: 2, pre: true, release: true })).toEqual({ phrase: [{ type: "down", text: "" }], preBendLabel: "PB Full" });
	});

	it("names every kind it draws", () => {
		expect([...RENDER_KINDS].sort()).toEqual(
			["tie", "hammer", "pull", "slide", "bend", "ghost", "vibrato", "harmonic", "tap", "trill", "tremolo", "pick", "accent", "staccato", "slideIn", "slideOut", "whammy", "scrape", "palmMute", "letRing", "slur", "slap", "thumbSlap", "bodyTap"].sort(),
		);
	});
});

describe("fingerpickToVexFlow — the rest of the registry", () => {
	const v2 = (slots: BeatSlot[], over: Partial<FingerpickPattern> = {}): FingerpickPattern => ({
		id: "p",
		name: "p",
		bpm: 100,
		timeSignature: [4, 4],
		schemaVersion: 2,
		measures: [{ id: "m1", slots }],
		...over,
	});
	const ctx = (p: FingerpickPattern) => ({ index: indexPattern(p) });
	const texts = (rd: ReturnType<typeof fingerpickToVexFlow>, i: number) =>
		(rd.notes[i] as TabNote).getModifiers().filter((m) => m instanceof Annotation).map((m) => (m as Annotation).getText());

	it("a harmonic is written in angle brackets with its letters above", () => {
		const p = v2([beatSlot("s1", "quarter", { 2: { fret: 12, effects: { harmonic: { type: "artificial", touchFret: 24 } } } })]);
		const rd = fingerpickToVexFlow(p.measures[0], ctx(p));
		expect((rd.notes[0] as TabNote).getPositions()[0].fret).toBe("<12>");
		expect(texts(rd, 0)).toContain("A.H.");
	});

	it("slides into and out of a note are marks on their strings, not annotations", () => {
		const p = v2([beatSlot("s1", "quarter", { 2: { fret: 7, effects: { slideIn: { from: "below" } } }, 0: { fret: 3, effects: { slideOut: { to: "above" } } } })]);
		const rd = fingerpickToVexFlow(p.measures[0], ctx(p));
		expect(rd.slideMarks).toEqual([
			{ noteIndex: 0, stringIndex: 0, side: "out", direction: "above" },
			{ noteIndex: 0, stringIndex: 2, side: "in", direction: "below" },
		]);
		expect(texts(rd, 0)).toEqual([]);
	});

	it("a whammy writes w/bar and a dashed-line mark with its depth; a scrape writes P.S. and a diagonal", () => {
		const p = v2([
			beatSlot("s1", "quarter", { 2: { fret: 7, effects: { whammy: { kind: "dive" } } } }),
			beatSlot("s2", "quarter", { 2: { fret: 7, effects: { whammy: { kind: "pull", semitones: 1 } } } }),
			beatSlot("s3", "quarter", { 2: { fret: 7, effects: { scrape: true } } }),
		]);
		const rd = fingerpickToVexFlow(p.measures[0], ctx(p));
		expect(texts(rd, 0)).toContain("w/bar");
		expect(rd.whammies).toEqual([
			{ noteIndex: 0, kind: "dive", label: "-2" },
			{ noteIndex: 1, kind: "pull", label: "+1" },
		]);
		expect(rd.expression.bends).toBe(2);
		expect(texts(rd, 2)).toContain("P.S.");
		expect(rd.scrapes).toEqual([2]);
	});

	it("a slur is one segment over its notes and the hammer / pull arcs inside it are left out", () => {
		const p = v2(
			[
				beatSlot("a", "quarter", { 2: { fret: 5 } }),
				beatSlot("b", "quarter", { 2: { fret: 7, link: { kind: "hammer" } } }),
				beatSlot("c", "quarter", { 2: { fret: 5, link: { kind: "pull" } } }),
				beatSlot("d", "quarter", { 2: { fret: 7, link: { kind: "hammer" } } }),
			],
			{ spans: [{ id: "s", kind: "slur", from: "a", to: "c" }] },
		);
		const rd = fingerpickToVexFlow(p.measures[0], ctx(p));
		expect(rd.slurs).toEqual([{ fromNoteIndex: 0, toNoteIndex: 2 }]);
		// Only the hammer outside the slur draws its arc.
		expect(rd.connectors).toHaveLength(1);
	});

	it("a slur across a barline is two segments that say they continue", () => {
		const p: FingerpickPattern = {
			...v2([]),
			measures: [
				{ id: "m1", slots: [beatSlot("a", "half", { 2: { fret: 5 } }), beatSlot("b", "half", { 2: { fret: 7 } })] },
				{ id: "m2", slots: [beatSlot("c", "half", { 2: { fret: 8 } }), beatSlot("d", "half", { 2: { fret: 7 } })] },
			],
			spans: [{ id: "s", kind: "slur", from: "b", to: "c" }],
		};
		expect(fingerpickToVexFlow(p.measures[0], ctx(p)).slurs).toEqual([{ fromNoteIndex: 1, toNoteIndex: 1, continuesAfter: true }]);
		expect(fingerpickToVexFlow(p.measures[1], ctx(p)).slurs).toEqual([{ fromNoteIndex: 0, toNoteIndex: 0, continuesBefore: true }]);
	});

	it("a shift slide draws the line without the sl. a legato slide carries", () => {
		const p = v2([
			beatSlot("a", "quarter", { 2: { fret: 5 } }),
			beatSlot("b", "quarter", { 2: { fret: 7, link: { kind: "slide", picked: true } } }),
			beatSlot("c", "quarter", { 2: { fret: 9, link: { kind: "slide" } } }),
		]);
		const rd = fingerpickToVexFlow(p.measures[0], ctx(p));
		expect(rd.connectors.map((c) => (c as unknown as { text: string }).text)).toEqual(["", "sl."]);
	});
});
