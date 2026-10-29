import { describe, it, expect } from "vitest";

import { keyChords } from "@/lib/fretboard/chords";
import {
	CIRCLE_RINGS,
	circleCells,
	circleIndex,
	circlePitchClass,
	keyCell,
	keyFromCircle,
	keyIndex,
	ringOfSuffix,
} from "@/lib/fretboard/circleOfFifths";
import { SCALE_ROOTS, SCALE_TYPES } from "@/lib/fretboard/scales";

const inKey = (root: string, scale: (typeof SCALE_TYPES)[number]) =>
	circleCells({ root, scale })
		.filter((c) => c.inKey)
		.map((c) => c.label);

describe("the circle", () => {
	it("runs a fifth a step, clockwise from C, the relative minor inside each key", () => {
		const cells = circleCells({ root: "C", scale: "major" });
		expect(cells.filter((c) => c.ring === "major").map((c) => c.label)).toEqual([
			"C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F",
		]);
		for (const c of cells.filter((c) => c.ring === "minor")) {
			expect(c.pitchClass).toBe((circlePitchClass("major", c.index) + 9) % 12);
		}
		for (const c of cells.filter((c) => c.ring === "dim")) {
			expect(c.pitchClass).toBe((circlePitchClass("major", c.index) + 11) % 12);
		}
	});

	it("finds a pitch class's place on every ring", () => {
		for (const ring of CIRCLE_RINGS) {
			for (let i = 0; i < 12; i++) expect(circleIndex(ring, circlePitchClass(ring, i))).toBe(i);
		}
		expect(circleIndex("major", 7)).toBe(1); // G
		expect(circleIndex("minor", 4)).toBe(1); // Em
		expect(circleIndex("major", 5)).toBe(11); // F
	});

	it("lights a key's seven chords: the key and its neighbours on two rings, vii° under it", () => {
		expect(inKey("C", "major").sort()).toEqual(["Am", "B°", "C", "Dm", "Em", "F", "G"].sort());
		expect(inKey("E", "major").sort()).toEqual(["A", "B", "C#m", "D#°", "E", "F#m", "G#m"].sort());
	});

	it("places a scale by the major key it is spelled in", () => {
		expect(keyIndex({ root: "A", scale: "minorPentatonic" })).toBe(0); // C
		expect(keyIndex({ root: "D", scale: "dorian" })).toBe(0);
		expect(keyIndex({ root: "G", scale: "mixolydian" })).toBe(0);
		expect(keyIndex({ root: "E", scale: "blues" })).toBe(1); // G
	});

	it("lights exactly the chords the key's degrees are, for every root and scale", () => {
		for (const root of SCALE_ROOTS) {
			for (const scale of SCALE_TYPES) {
				const lit = circleCells({ root, scale })
					.filter((c) => c.inKey)
					.map((c) => `${c.pitchClass}:${c.ring}`)
					.sort();
				const degrees = keyChords({ root, scale })
					.map((c) => `${c.rootPitchClass}:${ringOfSuffix(c.suffix)}`)
					.sort();
				expect(lit).toEqual(degrees);
			}
		}
	});
});

describe("choosing a key on the circle", () => {
	it("names the key on the ring of its scale's family", () => {
		expect(keyCell({ root: "G", scale: "major" })).toEqual({ ring: "major", index: 1 });
		expect(keyCell({ root: "A", scale: "minorPentatonic" })).toEqual({ ring: "minor", index: 0 });
		expect(keyCell({ root: "D", scale: "dorian" })).toEqual({ ring: "minor", index: 11 });
	});

	it("keeps a scale of the ring's kind, else takes the ring's plain scale", () => {
		expect(keyFromCircle({ root: "A", scale: "blues" }, "minor", 1)).toEqual({ root: "E", scale: "blues" });
		expect(keyFromCircle({ root: "A", scale: "blues" }, "major", 1)).toEqual({ root: "G", scale: "major" });
		expect(keyFromCircle({ root: "C", scale: "mixolydian" }, "major", 2)).toEqual({ root: "D", scale: "mixolydian" });
		expect(keyFromCircle({ root: "C", scale: "major" }, "minor", 4)).toEqual({ root: "Db", scale: "naturalMinor" });
	});

	it("puts only plain triads on a ring", () => {
		expect(ringOfSuffix("major")).toBe("major");
		expect(ringOfSuffix("minor")).toBe("minor");
		expect(ringOfSuffix("dim")).toBe("dim");
		expect(ringOfSuffix("m7")).toBeNull();
	});
});
