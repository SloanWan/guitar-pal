import { describe, it, expect } from "vitest";

import { SCALE_ROOTS } from "@/lib/fretboard/scales";
import { PIANO_61, isBlackKey, keyLabel, pianoKeys, pitchClassOf, whiteKeyCount } from "@/lib/piano/keys";

describe("pianoKeys", () => {
	const keys = pianoKeys(PIANO_61);

	it("lays out 61 keys C2–C7 as 36 white and 25 black", () => {
		expect(keys).toHaveLength(61);
		expect(keys[0].midi).toBe(36);
		expect(keys[60].midi).toBe(96);
		expect(keys.filter((k) => !k.isBlack)).toHaveLength(36);
		expect(keys.filter((k) => k.isBlack)).toHaveLength(25);
		expect(whiteKeyCount(PIANO_61)).toBe(36);
	});

	it("numbers white keys left to right and puts C4 on the 15th", () => {
		const whites = keys.filter((k) => !k.isBlack);
		expect(whites.map((k) => k.whiteIndex)).toEqual(whites.map((_, i) => i));
		const c4 = keys.find((k) => k.midi === 60)!;
		expect(c4.whiteIndex).toBe(14); // two octaves of 7 white keys below it
		expect(c4.octave).toBe(4);
		expect(c4.name).toBe("C");
	});

	it("sits every black key against the white key on its left, in every octave", () => {
		for (const key of keys.filter((k) => k.isBlack)) {
			const left = keys.find((k) => k.midi === key.midi - 1)!;
			const right = keys.find((k) => k.midi === key.midi + 1)!;
			expect(left.isBlack).toBe(false);
			expect(right.isBlack).toBe(false);
			expect(key.whiteIndex).toBe(left.whiteIndex);
			expect(right.whiteIndex).toBe(left.whiteIndex + 1);
		}
		// The gaps: no black key between E–F and B–C.
		const blackPcs = new Set(keys.filter((k) => k.isBlack).map((k) => k.pitchClass));
		expect([...blackPcs].sort((a, b) => a - b)).toEqual([1, 3, 6, 8, 10]);
	});

	it("spells every pitch class the way the scale roots are spelled", () => {
		for (const key of keys) expect(key.name).toBe(SCALE_ROOTS[key.pitchClass]);
		expect(keys.find((k) => k.midi === 61)!.name).toBe("Db");
		expect(keys.find((k) => k.midi === 66)!.name).toBe("F#");
		expect(keys.find((k) => k.midi === 70)!.name).toBe("Bb");
	});

	it("lays out a range that does not start on C", () => {
		const e2ToA2 = pianoKeys({ fromMidi: 40, toMidi: 45 }); // E F F# G Ab A
		expect(e2ToA2.map((k) => [k.name, k.isBlack, k.whiteIndex])).toEqual([
			["E", false, 0],
			["F", false, 1],
			["F#", true, 1],
			["G", false, 2],
			["Ab", true, 2],
			["A", false, 3],
		]);
	});

	it("refuses a range that starts or ends on a black key, or runs backwards", () => {
		expect(() => pianoKeys({ fromMidi: 37, toMidi: 48 })).toThrow(/white key/);
		expect(() => pianoKeys({ fromMidi: 36, toMidi: 46 })).toThrow(/white key/);
		expect(() => pianoKeys({ fromMidi: 48, toMidi: 36 })).toThrow(/Empty/);
	});
});

describe("key helpers", () => {
	it("names keys in scientific pitch", () => {
		expect(keyLabel(60)).toBe("C4");
		expect(keyLabel(40)).toBe("E2");
		expect(keyLabel(86)).toBe("D6");
		expect(keyLabel(66)).toBe("F#4");
		expect(keyLabel(21)).toBe("A0");
	});

	it("knows the black keys and the pitch class of any midi", () => {
		expect(isBlackKey(61)).toBe(true);
		expect(isBlackKey(64)).toBe(false);
		expect(pitchClassOf(60)).toBe(0);
		expect(pitchClassOf(71)).toBe(11);
	});
});
