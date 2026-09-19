// A chord is reachable from a position when one of its shapes has every
// fretted note inside the window. Open strings cost nothing, a capo moves the
// shape up, and the shape shown is the standard one when it fits.
import { describe, it, expect } from "vitest";

import type { ChordVoicing } from "@/lib/chordVoicing";
import { keyChords } from "@/lib/fretboard/chords";
import { MIN_REACHABLE, reachableChords, voicingFits } from "@/lib/fretboard/reachable";

function voicing(frets: string, start_fret = 1, label: string | null = null): ChordVoicing {
	return { id: `${frets}@${start_fret}`, label, start_fret, barre_fret: null, capo: false, frets, fingers: "000000" };
}

const C_OPEN = voicing("x32010", 1, "Standard");
const C_BARRE_3 = voicing("113331", 3); // A-shape barre at the third fret: frets 3..5
const C_BARRE_8 = voicing("133211", 8); // E-shape barre at the eighth fret: frets 8..10
const E_MINOR = voicing("022000", 1, "Standard");
const A_MINOR_5 = voicing("133111", 5);

describe("voicingFits", () => {
	it("needs every fretted note inside the window", () => {
		expect(voicingFits(C_OPEN, 0, { fromFret: 0, toFret: 4 })).toBe(true);
		expect(voicingFits(C_OPEN, 0, { fromFret: 3, toFret: 7 })).toBe(false); // the 1st and 2nd frets
		expect(voicingFits(C_BARRE_3, 0, { fromFret: 3, toFret: 7 })).toBe(true);
		expect(voicingFits(C_BARRE_3, 0, { fromFret: 4, toFret: 8 })).toBe(false);
	});

	it("lets open strings ring from any position", () => {
		// x32010 is held at frets 1–3; the open G and E cost no finger.
		expect(voicingFits(C_OPEN, 0, { fromFret: 1, toFret: 5 })).toBe(true);
		expect(voicingFits(E_MINOR, 0, { fromFret: 2, toFret: 6 })).toBe(true);
	});

	it("moves the shape up with the capo", () => {
		// x32010 behind a capo at 5 is held at frets 6–8.
		expect(voicingFits(C_OPEN, 5, { fromFret: 5, toFret: 9 })).toBe(true);
		expect(voicingFits(C_OPEN, 5, { fromFret: 0, toFret: 4 })).toBe(false);
		expect(voicingFits(C_OPEN, 5, { fromFret: 7, toFret: 11 })).toBe(false);
	});
});

describe("reachableChords", () => {
	const chords = keyChords({ root: "C", scale: "major" });
	const library: Record<string, ChordVoicing[]> = {
		"C major": [C_OPEN, C_BARRE_3, C_BARRE_8],
		"E minor": [E_MINOR],
		"A minor": [A_MINOR_5],
	};
	const voicingsOf = (c: { root: string; suffix: string }) => library[`${c.root} ${c.suffix}`] ?? [];

	it("lists the chords with a shape in the window, in degree order", () => {
		const open = reachableChords(chords, voicingsOf, { fromFret: 0, toFret: 4 }, 0);
		expect(open.map((r) => r.chord.numeral)).toEqual(["I", "iii"]);
		const fifth = reachableChords(chords, voicingsOf, { fromFret: 5, toFret: 9 }, 0);
		expect(fifth.map((r) => r.chord.numeral)).toEqual(["vi"]);
		expect(fifth.length).toBeLessThan(MIN_REACHABLE);
	});

	it("shows the standard shape when it fits, else the fitting shape lowest on the neck", () => {
		const open = reachableChords(chords, voicingsOf, { fromFret: 0, toFret: 4 }, 0);
		expect(open[0].voicing).toBe(C_OPEN);
		const third = reachableChords(chords, voicingsOf, { fromFret: 3, toFret: 7 }, 0);
		expect(third.map((r) => r.chord.numeral)).toEqual(["I", "vi"]);
		expect(third[0].voicing).toBe(C_BARRE_3);
		const eighth = reachableChords(chords, voicingsOf, { fromFret: 7, toFret: 11 }, 0);
		expect(eighth[0].voicing).toBe(C_BARRE_8);
	});

	it("takes the capo into account and leaves out chords the library has nothing for", () => {
		// Behind a capo at 3, the open C shape is held at frets 4–6.
		const withCapo = reachableChords(chords, voicingsOf, { fromFret: 3, toFret: 7 }, 3);
		expect(withCapo.map((r) => r.chord.numeral)).toEqual(["I", "iii"]);
		expect(withCapo[0].voicing).toBe(C_OPEN);
		expect(reachableChords(chords, () => [], { fromFret: 0, toFret: 4 }, 0)).toEqual([]);
	});
});
