import { describe, it, expect } from "vitest";

import { NOTE_NAMES } from "@/lib/chordVoicingToMidi";
import {
	SCALE_INTERVALS,
	SCALE_ROOTS,
	SCALE_TYPES,
	createLabeler,
	degreeLabel,
	pitchClassAt,
	scaleMarks,
	scalePitchClasses,
	usesFlats,
} from "@/lib/fretboard/scales";
import type { FretMark } from "@/lib/fretboard/types";

const FULL_NECK = { fromFret: 0, toFret: 15 };

function labels(marks: readonly FretMark[]): string[] {
	return marks.map((m) => m.label);
}

describe("scalePitchClasses", () => {
	it("C major is the white keys", () => {
		expect(scalePitchClasses({ root: "C", scale: "major" })).toEqual([0, 2, 4, 5, 7, 9, 11]);
	});

	it("A minor pentatonic wraps around the octave", () => {
		expect(scalePitchClasses({ root: "A", scale: "minorPentatonic" })).toEqual([9, 0, 2, 4, 7]);
	});

	it("every root × every scale yields the interval count with no duplicates", () => {
		for (const root of SCALE_ROOTS) {
			for (const scale of SCALE_TYPES) {
				const pcs = scalePitchClasses({ root, scale });
				expect(pcs).toHaveLength(SCALE_INTERVALS[scale].length);
				expect(new Set(pcs).size).toBe(pcs.length);
				for (const pc of pcs) expect(pc).toBeGreaterThanOrEqual(0);
				for (const pc of pcs) expect(pc).toBeLessThan(12);
			}
		}
	});

	it("rejects a root the app does not spell", () => {
		expect(() => scalePitchClasses({ root: "H", scale: "major" })).toThrow(/Unknown scale root/);
	});
});

describe("degreeLabel", () => {
	it("names every interval with flats for altered degrees", () => {
		expect([...Array(12).keys()].map(degreeLabel)).toEqual([
			"1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7",
		]);
	});

	it("normalises negative and wrapped intervals", () => {
		expect(degreeLabel(-1)).toBe("7");
		expect(degreeLabel(15)).toBe("b3");
	});

	it("the blues scale reads 1 b3 4 b5 5 b7", () => {
		expect(SCALE_INTERVALS.blues.map(degreeLabel)).toEqual(["1", "b3", "4", "b5", "5", "b7"]);
	});
});

describe("usesFlats", () => {
	it("flat roots spell flat, sharp roots spell sharp", () => {
		expect(usesFlats({ root: "Bb", scale: "major" })).toBe(true);
		expect(usesFlats({ root: "F#", scale: "major" })).toBe(false);
		expect(usesFlats({ root: "Eb", scale: "minorPentatonic" })).toBe(true);
	});

	it("natural roots follow the relative major's key signature", () => {
		expect(usesFlats({ root: "F", scale: "major" })).toBe(true);
		expect(usesFlats({ root: "D", scale: "naturalMinor" })).toBe(true); // relative F
		expect(usesFlats({ root: "G", scale: "minorPentatonic" })).toBe(true); // relative Bb
		expect(usesFlats({ root: "E", scale: "naturalMinor" })).toBe(false); // relative G
		expect(usesFlats({ root: "A", scale: "dorian" })).toBe(false); // relative G
		expect(usesFlats({ root: "F", scale: "mixolydian" })).toBe(true); // relative Bb
		expect(usesFlats({ root: "C", scale: "major" })).toBe(false);
	});
});

describe("createLabeler", () => {
	it("spells D minor with a Bb, not an A#", () => {
		const label = createLabeler({ root: "D", scale: "naturalMinor" }, "note");
		expect(label(10)).toBe("Bb");
	});

	it("spells E minor with an F#", () => {
		const label = createLabeler({ root: "E", scale: "naturalMinor" }, "note");
		expect(label(6)).toBe("F#");
	});

	it("degree mode labels relative to the root, for notes outside the scale too", () => {
		const label = createLabeler({ root: "A", scale: "minorPentatonic" }, "degree");
		expect(label(9)).toBe("1");
		expect(label(0)).toBe("b3");
		expect(label(8)).toBe("7"); // G#: not in the scale, still nameable
	});
});

describe("scaleMarks", () => {
	it("marks open strings when the window starts at the nut", () => {
		const marks = scaleMarks({ root: "E", scale: "minorPentatonic" }, FULL_NECK, "note");
		const open = marks.filter((m) => m.fret === 0);
		// E A D G B e: every open string is in E minor pentatonic.
		expect(open.map((m) => m.string)).toEqual([0, 1, 2, 3, 4, 5]);
		expect(labels(open)).toEqual(["E", "A", "D", "G", "B", "E"]);
		expect(open[0].emphasis).toBe("root");
		expect(open[5].emphasis).toBe("root");
		expect(open[1].emphasis).toBe("scaleTone");
	});

	it("respects both window boundaries, inclusive", () => {
		const marks = scaleMarks({ root: "C", scale: "major" }, { fromFret: 5, toFret: 8 }, "note");
		expect(marks.length).toBeGreaterThan(0);
		for (const m of marks) {
			expect(m.fret).toBeGreaterThanOrEqual(5);
			expect(m.fret).toBeLessThanOrEqual(8);
		}
		// Fret 8 on the low E is C: the boundary itself is included.
		expect(marks.some((m) => m.string === 0 && m.fret === 8 && m.emphasis === "root")).toBe(true);
	});

	it("orders marks low E first, nut to body", () => {
		const marks = scaleMarks({ root: "G", scale: "major" }, { fromFret: 0, toFret: 3 }, "note");
		const order = marks.map((m) => m.string * 100 + m.fret);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
	});

	it("labels degrees with flats where the scale has them", () => {
		const marks = scaleMarks({ root: "A", scale: "naturalMinor" }, { fromFret: 0, toFret: 5 }, "degree");
		const lowE = marks.filter((m) => m.string === 0);
		// E F G A on the low E (frets 0 1 3 5): 5 b6 b7 1
		expect(labels(lowE)).toEqual(["5", "b6", "b7", "1"]);
	});

	it("every mark's pitch class belongs to the scale, and every scale note appears on every string", () => {
		for (const root of ["C", "Bb", "F#"]) {
			for (const scale of SCALE_TYPES) {
				const spec = { root, scale };
				const inScale = new Set(scalePitchClasses(spec));
				const marks = scaleMarks(spec, FULL_NECK, "note");
				for (const m of marks) expect(inScale.has(pitchClassAt(m.string, m.fret))).toBe(true);
				for (let s = 0; s < 6; s++) {
					const onString = new Set(marks.filter((m) => m.string === s).map((m) => pitchClassAt(m.string, m.fret)));
					expect(onString).toEqual(inScale);
				}
			}
		}
	});

	it("note labels agree with the shared note table up to spelling", () => {
		const marks = scaleMarks({ root: "C", scale: "major" }, FULL_NECK, "note");
		for (const m of marks) expect(m.label).toBe(NOTE_NAMES[pitchClassAt(m.string, m.fret)]);
	});
});
