// The octave of the key pressed picks the shape: the one whose top note is
// nearest the key, the standard one when two are as near.
import { describe, it, expect } from "vitest";

import type { ChordVoicing } from "@/lib/chordVoicing";
import { voicingNearest } from "@/lib/fretboard/voicingRegister";

function voicing(frets: string, start_fret: number, label: string | null = null): ChordVoicing {
	return { id: `${frets}@${start_fret}`, label, start_fret, barre_fret: null, capo: false, frets, fingers: "000000" };
}

// The library's four C majors: open, A-shape at 3, a triad at 5, E-shape at 8.
const OPEN = voicing("x32010", 1, "Standard"); // top E4 (64)
const A_SHAPE = voicing("113331", 3); // top G4 (67)
const TRIAD = voicing("xx1114", 5); // top C5 (72)
const E_SHAPE = voicing("133211", 8); // top C5 (72)
const C = [OPEN, A_SHAPE, TRIAD, E_SHAPE];

describe("voicingNearest", () => {
	it("holds the open shape for a low key and a shape up the neck for a high one", () => {
		expect(voicingNearest(C, 48, 0)).toBe(OPEN); // C3
		expect(voicingNearest(C, 60, 0)).toBe(OPEN); // C4
		expect(voicingNearest(C, 72, 0)).toBe(TRIAD); // C5: two shapes top out here; the lower on the neck wins
		expect(voicingNearest(C, 84, 0)).toBe(TRIAD); // C6, above the guitar: the highest shape there is
	});

	it("prefers the standard shape when two are as near", () => {
		// F4 (65) is one away from the open shape's top and two from the A-shape's.
		expect(voicingNearest(C, 65, 0)).toBe(OPEN);
		// G4 (67): the A-shape's top exactly, so it wins over the open shape at three away.
		expect(voicingNearest(C, 67, 0)).toBe(A_SHAPE);
		// Between two non-standard shapes as near as each other, the lower on the neck.
		expect(voicingNearest([E_SHAPE, TRIAD], 72, 0)).toBe(TRIAD);
	});

	it("measures against what sounds with the capo", () => {
		// Capo 2 lifts every top note by two: the open shape now tops out at F♯4 (66).
		expect(voicingNearest(C, 66, 2)).toBe(OPEN);
		expect(voicingNearest(C, 74, 2)).toBe(TRIAD);
	});

	it("has nothing to say without shapes", () => {
		expect(voicingNearest([], 60, 0)).toBeNull();
	});
});
