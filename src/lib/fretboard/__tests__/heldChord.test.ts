// A held shape is read backwards from a degree: the shape is given, the capo
// moves what it sounds, and the key decides whether that deserves a numeral.
import { describe, it, expect } from "vitest";

import { keyChord } from "@/lib/fretboard/chords";
import { heldChordView, shownFromKeyChords, transposeChord } from "@/lib/fretboard/heldChord";

const C_MAJOR = { root: "C", scale: "major" } as const;

describe("transposeChord", () => {
	it("moves the root in the library's spelling, wrapping the octave", () => {
		expect(transposeChord("A", "m7", 3)).toEqual({ root: "C", suffix: "m7" });
		expect(transposeChord("Bb", "major", 3)).toEqual({ root: "C#", suffix: "major" });
		expect(transposeChord("G", "sus4", 7)).toEqual({ root: "D", suffix: "sus4" });
	});

	it("moves a slash chord's bass with it", () => {
		expect(transposeChord("C", "/E", 2)).toEqual({ root: "D", suffix: "/F#" });
		expect(transposeChord("A", "m/C#", 1)).toEqual({ root: "Bb", suffix: "m/D" });
	});

	it("leaves a root or bass it cannot read alone", () => {
		expect(transposeChord("?", "uk-x32010", 2)).toEqual({ root: "?", suffix: "uk-x32010" });
		expect(transposeChord("C", "/H", 2)).toEqual({ root: "D", suffix: "/H" });
	});
});

describe("heldChordView", () => {
	it("is the same chord on both sides without a capo, with the key's numeral when its notes are the key's", () => {
		// Am7: A C E G, all in C major → vi.
		const shown = heldChordView({ root: "A", suffix: "m7", voicingId: null, side: "shape" }, C_MAJOR, 0, [9, 0, 4, 7]);
		expect(shown.sounding).toEqual({ root: "A", suffix: "m7", rootPitchClass: 9 });
		expect(shown.shape).toEqual(shown.sounding);
		expect(shown.numeral).toBe("vi");
		expect(shown.triad).toBeNull();
	});

	it("sounds the shape moved up by the capo, and judges the numeral by what sounds", () => {
		// The Am7 shape behind a capo at 3 sounds Cm7: C E♭ G B♭ — not C major's.
		const shown = heldChordView({ root: "A", suffix: "m7", voicingId: null, side: "shape" }, C_MAJOR, 3, [0, 3, 7, 10]);
		expect(shown.sounding).toEqual({ root: "C", suffix: "m7", rootPitchClass: 0 });
		expect(shown.shape).toEqual({ root: "A", suffix: "m7", rootPitchClass: 9 });
		expect(shown.numeral).toBeNull();
		// The same shape at capo 3 in E♭ major is ii… but only its tonic chord's numeral is given here:
		// Cm7 is vi of E♭ major.
		expect(heldChordView({ root: "A", suffix: "m7", voicingId: null, side: "shape" }, { root: "Eb", scale: "major" }, 3, [0, 3, 7, 10]).numeral).toBe("vi");
	});

	it("withholds the numeral for a chord with a note outside the key, or before its notes are known", () => {
		// A7 has a C♯: not C major's chord, though A is a scale tone.
		expect(heldChordView({ root: "A", suffix: "7", voicingId: null, side: "shape" }, C_MAJOR, 0, [9, 1, 4, 7]).numeral).toBeNull();
		expect(heldChordView({ root: "A", suffix: "m7", voicingId: null, side: "shape" }, C_MAJOR, 0, null).numeral).toBeNull();
		// A root outside the scale never gets one, whatever the notes.
		expect(heldChordView({ root: "Eb", suffix: "major", voicingId: null, side: "shape" }, C_MAJOR, 0, [3, 7, 10]).numeral).toBeNull();
	});
});

describe("heldChordView — a sounding chord", () => {
	it("keeps the heard chord and puts the shape the capo's distance below it", () => {
		// D heard at capo 2 is a C shape; D major's F♯ is not C major's, so no numeral.
		const shown = heldChordView({ root: "D", suffix: "major", voicingId: null, side: "sounding" }, C_MAJOR, 2, [2, 6, 9]);
		expect(shown.sounding).toEqual({ root: "D", suffix: "major", rootPitchClass: 2 });
		expect(shown.shape).toEqual({ root: "C", suffix: "major", rootPitchClass: 0 });
		expect(shown.numeral).toBeNull();
		// The same chord at capo 5 is an A shape; in D major it is I.
		const inD = heldChordView({ root: "D", suffix: "major", voicingId: null, side: "sounding" }, { root: "D", scale: "major" }, 5, [2, 6, 9]);
		expect(inD.shape.root).toBe("A");
		expect(inD.numeral).toBe("I");
	});
});

describe("shownFromKeyChords", () => {
	it("carries a degree's names, numeral and triad", () => {
		const em = keyChord(C_MAJOR, 4);
		const shown = shownFromKeyChords(em, em);
		expect(shown.sounding).toEqual({ root: "E", suffix: "minor", rootPitchClass: 4 });
		expect(shown.numeral).toBe("iii");
		expect(shown.triad).toEqual([4, 7, 11]);
	});
});
