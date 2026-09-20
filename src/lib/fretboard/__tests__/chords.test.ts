import { describe, it, expect } from "vitest";

import type { ChordVoicing } from "@/lib/chordVoicing";
import { PARENT_SCALE, keyChord, keyChords, shapeMarks, shapePitches } from "@/lib/fretboard/chords";
import { NOTE_NAMES } from "@/lib/chordVoicingToMidi";
import { SCALE_TYPES } from "@/lib/fretboard/scales";

const summary = (spec: Parameters<typeof keyChords>[0]) =>
	keyChords(spec).map((c) => `${c.root}${c.suffix === "major" ? "" : c.suffix === "minor" ? "m" : c.suffix} ${c.numeral}`);

describe("keyChords — diatonic triads by stacked thirds", () => {
	it("spells C major as I ii iii IV V vi vii°", () => {
		expect(summary({ root: "C", scale: "major" })).toEqual([
			"C I",
			"Dm ii",
			"Em iii",
			"F IV",
			"G V",
			"Am vi",
			"Bdim vii°",
		]);
	});

	it("spells A natural minor as i ii° III iv v VI VII", () => {
		expect(summary({ root: "A", scale: "naturalMinor" })).toEqual([
			"Am i",
			"Bdim ii°",
			"C III",
			"Dm iv",
			"Em v",
			"F VI",
			"G VII",
		]);
	});

	it("spells the modes: D dorian and G mixolydian", () => {
		expect(summary({ root: "D", scale: "dorian" })).toEqual([
			"Dm i",
			"Em ii",
			"F III",
			"G IV",
			"Am v",
			"Bdim vi°",
			"C VII",
		]);
		expect(summary({ root: "G", scale: "mixolydian" })).toEqual([
			"G I",
			"Am ii",
			"Bdim iii°",
			"C IV",
			"Dm v",
			"Em vi",
			"F VII",
		]);
	});

	it("builds pentatonic and blues chords from the parent seven-note scale", () => {
		expect(PARENT_SCALE.minorPentatonic).toBe("naturalMinor");
		expect(PARENT_SCALE.blues).toBe("naturalMinor");
		expect(PARENT_SCALE.majorPentatonic).toBe("major");
		expect(summary({ root: "A", scale: "minorPentatonic" })).toEqual(summary({ root: "A", scale: "naturalMinor" }));
		expect(summary({ root: "E", scale: "blues" })).toEqual(summary({ root: "E", scale: "naturalMinor" }));
		expect(summary({ root: "G", scale: "majorPentatonic" })).toEqual(summary({ root: "G", scale: "major" }));
	});

	it("uses the chord library's spelling for every root, whatever the scale root's spelling", () => {
		// Db major is spelled with flats on the board, but the chord tables say C#, Eb, Ab, Bb.
		expect(keyChords({ root: "Db", scale: "major" }).map((c) => c.root)).toEqual(["C#", "Eb", "F", "F#", "Ab", "Bb", "C"]);
		for (const scale of SCALE_TYPES) {
			for (const c of keyChords({ root: "F#", scale })) expect(c.diatonic).toBe(true);
		}
	});

	it("carries the triad's pitch classes, root first", () => {
		const g = keyChord({ root: "C", scale: "major" }, 7);
		expect(g.pitchClasses).toEqual([7, 11, 2]);
		expect(g.degree).toBe(5);
		expect(g.pitchClasses.map((pc) => NOTE_NAMES[pc])).toEqual(["G", "B", "D"]);
	});
});

describe("keyChord — chromatic roots", () => {
	it("gives a major triad with the key's accidental numeral", () => {
		const cMajor = { root: "C", scale: "major" } as const;
		expect(keyChord(cMajor, 1)).toMatchObject({ root: "C#", suffix: "major", numeral: "♭II", diatonic: false, degree: null });
		expect(keyChord(cMajor, 3).numeral).toBe("♭III");
		expect(keyChord(cMajor, 6).numeral).toBe("♯IV");
		expect(keyChord(cMajor, 8).numeral).toBe("♭VI");
		expect(keyChord(cMajor, 10).numeral).toBe("♭VII");
		expect(keyChord(cMajor, 10).pitchClasses).toEqual([10, 2, 5]); // Bb D F

		const aMinor = { root: "A", scale: "naturalMinor" } as const;
		expect(keyChord(aMinor, 10).numeral).toBe("♭II"); // Bb
		expect(keyChord(aMinor, 1).numeral).toBe("♯III"); // C#
		expect(keyChord(aMinor, 3).numeral).toBe("♯IV"); // D#
		expect(keyChord(aMinor, 6).numeral).toBe("♯VI"); // F#
		expect(keyChord(aMinor, 8).numeral).toBe("♯VII"); // G#
	});

	it("accepts any integer pitch class", () => {
		expect(keyChord({ root: "C", scale: "major" }, 12 + 7).numeral).toBe("V");
		expect(keyChord({ root: "C", scale: "major" }, -5).numeral).toBe("V");
	});
});

// Open C: x32010 → strings low→high: muted, C3(3rd fret A), E3, G3, C4, E4.
const OPEN_C: ChordVoicing = {
	id: "c",
	label: "Standard",
	start_fret: 1,
	barre_fret: null,
	capo: false,
	frets: "x32010",
	fingers: "032010",
};
// E-shape F barre at fret 1: 133211.
const F_BARRE: ChordVoicing = {
	id: "f",
	label: "Standard",
	start_fret: 1,
	barre_fret: 1,
	capo: false,
	frets: "133211",
	fingers: "134211",
};
const noteName = (pc: number) => NOTE_NAMES[pc];

describe("shapePitches", () => {
	it("sounds the shape's strings, muted ones left out, raised by the capo", () => {
		expect(shapePitches(OPEN_C, 0)).toEqual([48, 52, 55, 60, 64]);
		expect(shapePitches(OPEN_C, 2)).toEqual([50, 54, 57, 62, 66]); // a D chord
		expect(shapePitches(F_BARRE, 0)).toEqual([41, 48, 53, 57, 60, 65]);
	});
});

describe("shapeMarks", () => {
	it("lights the open C shape with its root and roles, the muted string at the nut", () => {
		const marks = shapeMarks(OPEN_C, 0, 0, noteName);
		expect(marks).toEqual([
			{ string: 0, fret: 0, label: "", emphasis: "muted" },
			{ string: 1, fret: 3, label: "C", emphasis: "root" },
			{ string: 2, fret: 2, label: "E", emphasis: "chordTone", tone: "third" },
			{ string: 3, fret: 0, label: "G", emphasis: "chordTone", tone: "fifth" },
			{ string: 4, fret: 1, label: "C", emphasis: "root" },
			{ string: 5, fret: 0, label: "E", emphasis: "chordTone", tone: "third" },
		]);
	});

	it("moves the shape above a capo and names the sounding pitches", () => {
		const marks = shapeMarks(OPEN_C, 2, 0, noteName);
		expect(marks[0]).toEqual({ string: 0, fret: 2, label: "", emphasis: "muted" });
		expect(marks[1]).toEqual({ string: 1, fret: 5, label: "D", emphasis: "root" });
		expect(marks[3]).toEqual({ string: 3, fret: 2, label: "A", emphasis: "chordTone", tone: "fifth" });
		expect(marks.every((m) => m.fret >= 2)).toBe(true);
	});

	it("handles a barre shape with a fretted root on the low E", () => {
		const marks = shapeMarks(F_BARRE, 0, 5, noteName);
		expect(marks.filter((m) => m.emphasis === "root").map((m) => [m.string, m.fret])).toEqual([
			[0, 1],
			[2, 3],
			[5, 1],
		]);
		expect(marks.find((m) => m.string === 1)).toMatchObject({ fret: 3, label: "C", tone: "fifth" });
		expect(marks.find((m) => m.string === 3)).toMatchObject({ fret: 2, label: "A", tone: "third" });
		expect(marks.find((m) => m.string === 4)).toMatchObject({ fret: 1, label: "C", tone: "fifth" });
	});
});
