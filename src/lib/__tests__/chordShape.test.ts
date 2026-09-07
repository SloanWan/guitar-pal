import { describe, it, expect } from "vitest";
import {
	CHORD_SHAPE_WINDOW,
	MAX_SHAPE_START_FRET,
	MUTED,
	chordShapeToVoicing,
	emptyChordShape,
	fretInWindow,
	stringsAtFret,
	suggestFingers,
	validateChordShape,
	voicingToChordShape,
	type ChordShape,
	type ShapeFret,
} from "@/lib/chordShape";
import { chordVoicingToMidi, GUITAR_OPEN_MIDI } from "@/lib/chordVoicingToMidi";
import { decodeVoicingStrings } from "@/lib/chordVoicingToVexChords";

/** Open C: x 3 2 0 1 0, low E first. */
const OPEN_C: ChordShape = {
	startFret: 1,
	frets: [MUTED, 3, 2, 0, 1, 0],
	fingers: [0, 3, 2, 0, 1, 0],
	barreFret: null,
};

/** F barre at the first fret: every string held, six at fret 1. */
const F_BARRE: ChordShape = {
	startFret: 1,
	frets: [1, 3, 3, 2, 1, 1],
	fingers: [1, 3, 4, 2, 1, 1],
	barreFret: 1,
};

/** A borrowed shape up the neck — the case this feature exists for. */
const UP_THE_NECK: ChordShape = {
	startFret: 9,
	frets: [MUTED, 9, 11, 11, 10, MUTED],
	fingers: [0, 1, 3, 4, 2, 0],
	barreFret: null,
};

describe("validateChordShape", () => {
	it("accepts shapes that can be played", () => {
		for (const shape of [OPEN_C, F_BARRE, UP_THE_NECK]) {
			expect(validateChordShape(shape)).toEqual({ ok: true, errors: [] });
		}
	});

	it("treats the window as a span, not a position", () => {
		// The whole point: a shape at the ninth fret is as expressible as one at
		// the first, so long as its notes lie within one window.
		expect(validateChordShape(UP_THE_NECK).ok).toBe(true);
		expect(UP_THE_NECK.startFret).toBeGreaterThan(CHORD_SHAPE_WINDOW);
	});

	it("rejects a note outside the window", () => {
		const wide: ChordShape = { ...OPEN_C, frets: [MUTED, 3, 2, 0, 1, 7] };
		const result = validateChordShape(wide);
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(/outside the 5-fret window/);
	});

	it("lets an open string sit outside the window", () => {
		// An open string is not held, so it is not part of the reach.
		const shape: ChordShape = { ...UP_THE_NECK, frets: [0, 9, 11, 11, 10, MUTED] };
		expect(validateChordShape(shape).ok).toBe(true);
	});

	it("rejects a shape that sounds nothing", () => {
		expect(validateChordShape(emptyChordShape()).ok).toBe(false);
		expect(validateChordShape(emptyChordShape()).errors).toContain(
			"a shape must sound at least one string",
		);
	});

	it("rejects a start fret off the neck", () => {
		// The frets have to move with the window: keeping OPEN_C's low frets while
		// sliding the window up is a different failure (notes outside the window),
		// and would pass this test for the wrong reason.
		const high: ChordShape = {
			startFret: MAX_SHAPE_START_FRET,
			frets: [MUTED, 18, 20, 20, 19, MUTED],
			fingers: [0, 1, 3, 4, 2, 0],
			barreFret: null,
		};
		expect(validateChordShape(high).ok).toBe(true);
		expect(validateChordShape({ ...high, startFret: MAX_SHAPE_START_FRET + 1 }).ok).toBe(false);
		expect(validateChordShape({ ...OPEN_C, startFret: 0 }).ok).toBe(false);
	});

	it("rejects a finger nobody has", () => {
		expect(validateChordShape({ ...OPEN_C, fingers: [0, 3, 2, 0, 9, 0] }).ok).toBe(false);
		// Zero is fine: writing the fingering is optional.
		expect(validateChordShape({ ...OPEN_C, fingers: [0, 0, 0, 0, 0, 0] }).ok).toBe(true);
	});

	it("rejects a barre that only one string is held at", () => {
		// One finger on one string is a finger, not a barre; drawing it as one
		// would tell the player to do something they are not doing.
		const result = validateChordShape({ ...OPEN_C, barreFret: 3 });
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(/at least two strings/);
	});

	it("accepts a barre across the strings that are actually held there", () => {
		expect(validateChordShape(F_BARRE).ok).toBe(true);
		expect(stringsAtFret(F_BARRE, 1)).toEqual([0, 4, 5]);
	});

	it("reports every problem at once", () => {
		const bad: ChordShape = { startFret: 0, frets: [MUTED, 99, 2, 0, 1, 0], fingers: [0, 9, 2, 0, 1, 0], barreFret: null };
		expect(validateChordShape(bad).errors.length).toBeGreaterThan(2);
	});

	it("does not throw on a malformed shape", () => {
		const junk = { startFret: 1, frets: [], fingers: [], barreFret: 3 } as unknown as ChordShape;
		expect(() => validateChordShape(junk)).not.toThrow();
		expect(validateChordShape(junk).ok).toBe(false);
	});
});

describe("fretInWindow", () => {
	it("counts the whole span, both ends included", () => {
		expect(fretInWindow(9, 9)).toBe(true);
		expect(fretInWindow(13, 9)).toBe(true);
		expect(fretInWindow(14, 9)).toBe(false);
		expect(fretInWindow(8, 9)).toBe(false);
	});

	it("lets open and muted strings through whatever the window", () => {
		expect(fretInWindow(0, 9)).toBe(true);
		expect(fretInWindow(MUTED, 9)).toBe(true);
	});
});

describe("encoding to a stored voicing", () => {
	it("writes frets relative to the window, open as 0 and muted as x", () => {
		const voicing = chordShapeToVoicing(OPEN_C, "v1");
		expect(voicing.frets).toBe("x3201" + "0");
		expect(voicing.fingers).toBe("032010");
		expect(voicing.start_fret).toBe(1);
	});

	it("shifts a shape up the neck into its own window", () => {
		const voicing = chordShapeToVoicing(UP_THE_NECK, "v2");
		expect(voicing.start_fret).toBe(9);
		// 9 -> 1, 11 -> 3, 10 -> 2 within a window starting at 9.
		expect(voicing.frets).toBe("x1332x");
	});

	it("writes the barre relative to the window too", () => {
		const shape: ChordShape = { ...F_BARRE, startFret: 5, frets: [5, 7, 7, 6, 5, 5], barreFret: 5 };
		expect(chordShapeToVoicing(shape, "v3").barre_fret).toBe(1);
		expect(chordShapeToVoicing(OPEN_C, "v4").barre_fret).toBeNull();
	});

	it("draws a barre across the strings held, not across all six", () => {
		// capo true would span the whole neck; a player's own shape describes what
		// their hand actually does.
		expect(chordShapeToVoicing(F_BARRE, "v5").capo).toBe(false);
	});
});

describe("round trips", () => {
	it("survives shape to voicing and back", () => {
		for (const shape of [OPEN_C, F_BARRE, UP_THE_NECK]) {
			expect(voicingToChordShape(chordShapeToVoicing(shape, "v"))).toEqual(shape);
		}
	});

	it("survives voicing to shape and back", () => {
		const voicing = chordShapeToVoicing(UP_THE_NECK, "v", "my shape");
		const again = chordShapeToVoicing(voicingToChordShape(voicing), "v", "my shape");
		expect(again).toEqual(voicing);
	});

	it("reads a malformed stored voicing as muted rather than as a wrong note", () => {
		const broken = { ...chordShapeToVoicing(OPEN_C, "v"), frets: "??????", fingers: "??????" };
		const shape = voicingToChordShape(broken);
		expect(shape.frets).toEqual([MUTED, MUTED, MUTED, MUTED, MUTED, MUTED]);
		expect(shape.fingers).toEqual([0, 0, 0, 0, 0, 0]);
	});
});

describe("what it plays is what it draws", () => {
	function midiOf(shape: ChordShape): number[] {
		return chordVoicingToMidi(chordShapeToVoicing(shape, "v")).map((n) => n.midi);
	}

	it("sounds open C", () => {
		// A2 E3 G3 C4 E4 — the open C shape without its muted low E.
		expect(midiOf(OPEN_C)).toEqual([48, 52, 55, 60, 64]);
	});

	it("sounds every string of an F barre", () => {
		expect(midiOf(F_BARRE)).toEqual([41, 48, 53, 57, 60, 65]);
	});

	it("derives pitch from the frets, whatever the shape is called", () => {
		// The reason a borrowed shape works: nothing downstream reads the name.
		const named = chordVoicingToMidi(chordShapeToVoicing(UP_THE_NECK, "v", "whatever"));
		const unnamed = chordVoicingToMidi(chordShapeToVoicing(UP_THE_NECK, "v", null));
		expect(named).toEqual(unnamed);
	});

	it("agrees with the frets the diagram decodes", () => {
		const voicing = chordShapeToVoicing(UP_THE_NECK, "v");
		const drawn = decodeVoicingStrings(voicing);
		UP_THE_NECK.frets.forEach((fret, i) => {
			expect(drawn[i].absoluteFret).toBe(fret);
		});
		// And the pitch of each is that fret above the open string.
		drawn
			.filter((d) => d.absoluteFret !== "x")
			.forEach((d) => {
				const expected = GUITAR_OPEN_MIDI[d.stringIndex] + (d.absoluteFret as number);
				expect(chordVoicingToMidi(voicing).find((n) => n.stringIndex === d.stringIndex)?.midi).toBe(
					expected,
				);
			});
	});
});

describe("suggestFingers", () => {
	/** Standard open shapes, low E first, as the ground truth. */
	function shape(frets: ShapeFret[], startFret = 1, barreFret: number | null = null): ChordShape {
		return { startFret, frets, fingers: [0, 0, 0, 0, 0, 0], barreFret };
	}

	it("gives open and muted strings no finger", () => {
		expect(suggestFingers(shape([MUTED, 3, 2, 0, 1, 0]))).toEqual([0, 3, 2, 0, 1, 0]);
	});

	it("matches the standard fingering of the open chords", () => {
		// The rule these are testing: the finger number rises with the fret.
		expect(suggestFingers(shape([MUTED, 3, 2, 0, 1, 0]))).toEqual([0, 3, 2, 0, 1, 0]); // C
		expect(suggestFingers(shape([MUTED, 0, 2, 2, 1, 0]))).toEqual([0, 0, 2, 3, 1, 0]); // Am
		expect(suggestFingers(shape([MUTED, MUTED, 0, 2, 3, 2]))).toEqual([0, 0, 0, 1, 3, 2]); // D
		expect(suggestFingers(shape([0, 2, 2, 0, 0, 0]))).toEqual([0, 1, 2, 0, 0, 0]); // Em
	});

	it("does not barre a chord that has fingers to spare", () => {
		// D has two notes at the second fret with a higher note between them, and
		// is still fingered rather than barred: three notes, three fingers.
		expect(suggestFingers(shape([MUTED, MUTED, 0, 2, 3, 2]))).toEqual([0, 0, 0, 1, 3, 2]);
		// A: three notes on one fret, played 1-2-3.
		expect(suggestFingers(shape([MUTED, 0, 2, 2, 2, 0]))).toEqual([0, 0, 1, 2, 3, 0]);
	});

	it("barres when there are more notes than fingers", () => {
		// F: six notes, three of them on the first fret.
		expect(suggestFingers(shape([1, 3, 3, 2, 1, 1]))).toEqual([1, 3, 4, 2, 1, 1]);
		// Bm: five notes, two on the second fret.
		expect(suggestFingers(shape([MUTED, 2, 4, 4, 3, 2]))).toEqual([0, 1, 3, 4, 2, 1]);
	});

	it("honours a barre the player set, rather than re-deciding", () => {
		// They are describing what their hand is doing; the editor does not argue.
		expect(suggestFingers(shape([MUTED, 0, 2, 2, 2, 0], 1, 2))).toEqual([0, 0, 1, 1, 1, 0]);
	});

	it("ignores a barre on a fret nothing is held at", () => {
		expect(suggestFingers(shape([MUTED, 3, 2, 0, 1, 0], 1, 4))).toEqual([0, 3, 2, 0, 1, 0]);
	});

	it("works the same way up the neck", () => {
		// Nothing about the rule depends on where the window sits.
		expect(suggestFingers(shape([MUTED, 9, 11, 11, 10, MUTED], 9))).toEqual([0, 1, 3, 4, 2, 0]);
	});

	it("gives nothing to a shape with no fretted note", () => {
		expect(suggestFingers(shape([0, 0, 0, 0, 0, 0]))).toEqual([0, 0, 0, 0, 0, 0]);
		expect(suggestFingers(emptyChordShape())).toEqual([0, 0, 0, 0, 0, 0]);
	});

	it("never suggests a finger nobody has", () => {
		const crowded = shape([1, 2, 3, 4, 5, 5]);
		const fingers = suggestFingers(crowded);
		expect(Math.max(...fingers)).toBeLessThanOrEqual(4);
		expect(validateChordShape({ ...crowded, fingers }).ok).toBe(true);
	});
});
