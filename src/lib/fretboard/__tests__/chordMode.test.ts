import { describe, it, expect } from "vitest";

import { chordModeView, inShape, shapeSlots } from "@/lib/fretboard/chordMode";
import type { FretMark } from "@/lib/fretboard/types";

describe("chordModeView", () => {
	it("is the same chord on both sides without a capo", () => {
		const view = chordModeView({ root: "C", scale: "major" }, 0, 4); // E
		expect(view.sounding).toMatchObject({ root: "E", suffix: "minor", numeral: "iii" });
		expect(view.shape).toMatchObject({ root: "E", suffix: "minor", numeral: "iii" });
		expect(view.shapeKeyRoot).toBe("C");
	});

	it("fingers the shape a capo below what is heard, at the same degree", () => {
		// Key of D, capo 2: the player holds C shapes. Pressing F# hears F#m (iii) and fingers Em.
		const view = chordModeView({ root: "D", scale: "major" }, 2, 6);
		expect(view.sounding).toMatchObject({ root: "F#", suffix: "minor", numeral: "iii", diatonic: true });
		expect(view.shape).toMatchObject({ root: "E", suffix: "minor", numeral: "iii", diatonic: true });
		expect(view.shapeKeyRoot).toBe("C");
		// Pressing D (the tonic) hears D and fingers C.
		expect(chordModeView({ root: "D", scale: "major" }, 2, 2).shape.root).toBe("C");
	});

	it("keeps a chromatic press chromatic on both sides", () => {
		const view = chordModeView({ root: "A", scale: "naturalMinor" }, 3, 1); // capo 3, press C#
		expect(view.sounding).toMatchObject({ root: "C#", numeral: "♯III", diatonic: false });
		expect(view.shape).toMatchObject({ root: "Bb", numeral: "♯III", diatonic: false });
		expect(view.shapeKeyRoot).toBe("F#"); // A minor shapes three frets down: F# minor
	});

	it("spells the shape key the way SCALE_ROOTS does", () => {
		expect(chordModeView({ root: "E", scale: "major" }, 3, 4).shapeKeyRoot).toBe("Db");
	});
});

const MARKS: readonly FretMark[] = [
	{ string: 0, fret: 0, label: "", emphasis: "muted" },
	{ string: 4, fret: 1, label: "C", emphasis: "root" },
	{ string: 1, fret: 3, label: "C", emphasis: "root" },
	{ string: 2, fret: 2, label: "E", emphasis: "chordTone", tone: "third" },
];

describe("shapeSlots / inShape", () => {
	it("lists the sounding strings low to high, muted ones left out", () => {
		expect(shapeSlots(MARKS)).toEqual([
			{ string: 1, fret: 3 },
			{ string: 2, fret: 2 },
			{ string: 4, fret: 1 },
		]);
	});

	it("recognises a shape's sounding slot and nothing else", () => {
		expect(inShape(MARKS, { string: 2, fret: 2 })).toBe(true);
		expect(inShape(MARKS, { string: 0, fret: 0 })).toBe(false); // muted
		expect(inShape(MARKS, { string: 2, fret: 3 })).toBe(false);
	});
});
