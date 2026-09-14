import { describe, it, expect } from "vitest";

import { GUITAR_OPEN_MIDI } from "@/lib/chordVoicingToMidi";
import { relatedSlots, slotMidi, slotsSounding } from "@/lib/fretboard/positions";

const NECK = { fromFret: 0, toFret: 22 };

describe("slotMidi", () => {
	it("is the open-string pitch plus the fret", () => {
		expect(slotMidi(0, 0)).toBe(40); // E2
		expect(slotMidi(5, 0)).toBe(64); // E4
		expect(slotMidi(0, 5)).toBe(45); // A2 = open A
		expect(slotMidi(0, 5)).toBe(GUITAR_OPEN_MIDI[1]);
		expect(slotMidi(4, 12)).toBe(71); // B4
	});
});

describe("slotsSounding", () => {
	it("lists every position of a pitch, low string first", () => {
		expect(slotsSounding(64, NECK)).toEqual([
			{ string: 1, fret: 19 },
			{ string: 2, fret: 14 },
			{ string: 3, fret: 9 },
			{ string: 4, fret: 5 },
			{ string: 5, fret: 0 },
		]);
		expect(slotsSounding(40, NECK)).toEqual([{ string: 0, fret: 0 }]);
	});

	it("returns nothing for a pitch the board cannot sound, and respects the window", () => {
		expect(slotsSounding(39, NECK)).toEqual([]); // below the low E
		expect(slotsSounding(87, NECK)).toEqual([]); // above the 22nd fret
		expect(slotsSounding(64, { fromFret: 0, toFret: 5 })).toEqual([
			{ string: 4, fret: 5 },
			{ string: 5, fret: 0 },
		]);
	});
});

describe("relatedSlots", () => {
	it("finds every unison of the open high e across the neck (e0 / B5 / G9 / D14 / A19)", () => {
		const { unison } = relatedSlots(5, 0, NECK);
		expect(unison).toEqual([
			{ string: 1, fret: 19 },
			{ string: 2, fret: 14 },
			{ string: 3, fret: 9 },
			{ string: 4, fret: 5 },
		]);
	});

	it("never lists the slot itself", () => {
		const { unison, octave } = relatedSlots(3, 9, NECK);
		expect(unison).not.toContainEqual({ string: 3, fret: 9 });
		expect(octave).not.toContainEqual({ string: 3, fret: 9 });
	});

	it("lists octaves as the same pitch class in another octave, and keeps them apart from unisons", () => {
		const { unison, octave } = relatedSlots(5, 0, NECK); // E4
		for (const pos of octave) {
			const midi = slotMidi(pos.string, pos.fret);
			expect(midi % 12).toBe(64 % 12);
			expect(midi).not.toBe(64);
		}
		for (const pos of unison) expect(slotMidi(pos.string, pos.fret)).toBe(64);
		// E2, E3 and E5 all live on a 22-fret neck.
		expect(octave).toContainEqual({ string: 0, fret: 0 }); // E2
		expect(octave).toContainEqual({ string: 0, fret: 12 }); // E3
		expect(octave).toContainEqual({ string: 5, fret: 12 }); // E5
		expect(octave).toContainEqual({ string: 2, fret: 2 }); // E3 on D
	});

	it("respects the fret window", () => {
		const { unison, octave } = relatedSlots(5, 0, { fromFret: 0, toFret: 5 });
		expect(unison).toEqual([{ string: 4, fret: 5 }]);
		expect(octave).toEqual([
			{ string: 0, fret: 0 },
			{ string: 2, fret: 2 },
		]);
	});

	it("has no unison for a pitch only one position sounds", () => {
		// Low E open is the lowest note on the board: nothing else reaches it.
		expect(relatedSlots(0, 0, NECK).unison).toEqual([]);
		// The top of the high e is the highest.
		expect(relatedSlots(5, 22, NECK).unison).toEqual([]);
	});
});
