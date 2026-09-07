import { describe, it, expect } from "vitest";

import { chordTonesFromMidi, overlayChordTones } from "@/lib/fretboard/overlay";
import { pitchClassAt, scaleMarks } from "@/lib/fretboard/scales";
import { slotKey, type FretMark } from "@/lib/fretboard/types";

const NECK = { fromFret: 0, toFret: 15 };

// Standard open voicings, low E first, as chordVoicingToMidi produces them.
const C_MAJOR = [48, 52, 55, 60, 64]; // x32010
const E7 = [40, 47, 50, 56, 59, 64]; // 020100
const A_MINOR = [45, 52, 57, 60, 64]; // x02210

function keys(marks: readonly FretMark[]): Set<string> {
	return new Set(marks.map((m) => slotKey(m.string, m.fret)));
}

describe("chordTonesFromMidi", () => {
	it("reduces a voicing to distinct sorted pitch classes", () => {
		expect(chordTonesFromMidi(C_MAJOR)).toEqual({ pitchClasses: [0, 4, 7] });
		expect(chordTonesFromMidi(E7, 4)).toEqual({ pitchClasses: [2, 4, 8, 11], rootPitchClass: 4 });
	});
});

describe("overlayChordTones", () => {
	const cMajor = { root: "C", scale: "major" } as const;

	it("a diatonic chord's marks are exactly the scale's slots, re-emphasised", () => {
		const scale = scaleMarks(cMajor, NECK, "note");
		const overlay = overlayChordTones(scale, chordTonesFromMidi(C_MAJOR, 0), cMajor, NECK, "note");
		expect(keys(overlay)).toEqual(keys(scale));
		for (const m of overlay) {
			const pc = pitchClassAt(m.string, m.fret);
			const expected = pc === 0 ? "root" : pc === 4 || pc === 7 ? "chordTone" : "scaleTone";
			expect(m.emphasis).toBe(expected);
		}
	});

	it("the scale root steps down to a scale tone when another chord is sounding", () => {
		const scale = scaleMarks(cMajor, NECK, "degree");
		const overlay = overlayChordTones(scale, chordTonesFromMidi(A_MINOR, 9), cMajor, NECK, "degree");
		const cSlots = overlay.filter((m) => pitchClassAt(m.string, m.fret) === 0);
		expect(cSlots.length).toBeGreaterThan(0);
		// C is the minor third of Am: a chord tone, still labelled "1" in the key of C.
		for (const m of cSlots) {
			expect(m.emphasis).toBe("chordTone");
			expect(m.label).toBe("1");
		}
		const aSlots = overlay.filter((m) => pitchClassAt(m.string, m.fret) === 9);
		for (const m of aSlots) {
			expect(m.emphasis).toBe("root");
			expect(m.label).toBe("6");
		}
	});

	it("adds a non-diatonic chord tone as a chord tone, labelled in the scale's spelling", () => {
		const aMinorPent = { root: "A", scale: "minorPentatonic" } as const;
		const scale = scaleMarks(aMinorPent, NECK, "note");
		const overlay = overlayChordTones(scale, chordTonesFromMidi(E7, 4), aMinorPent, NECK, "note");
		const gSharp = overlay.filter((m) => pitchClassAt(m.string, m.fret) === 8);
		let expectedCount = 0;
		for (let s = 0; s < 6; s++) {
			for (let f = 0; f <= 15; f++) if (pitchClassAt(s, f) === 8) expectedCount++;
		}
		expect(gSharp.length).toBe(expectedCount);
		for (const m of gSharp) {
			expect(m.emphasis).toBe("chordTone");
			expect(m.label).toBe("G#");
		}
		// B is neither in A minor pentatonic nor absent from E7: it appears too.
		expect(overlay.some((m) => pitchClassAt(m.string, m.fret) === 11)).toBe(true);
		// C is in the scale but not in E7: it stays a scale tone.
		for (const m of overlay.filter((m) => pitchClassAt(m.string, m.fret) === 0)) {
			expect(m.emphasis).toBe("scaleTone");
		}
	});

	it("labels an outside chord tone by degree when asked", () => {
		const aMinorPent = { root: "A", scale: "minorPentatonic" } as const;
		const scale = scaleMarks(aMinorPent, NECK, "degree");
		const overlay = overlayChordTones(scale, chordTonesFromMidi(E7, 4), aMinorPent, NECK, "degree");
		const gSharp = overlay.find((m) => pitchClassAt(m.string, m.fret) === 8);
		expect(gSharp?.label).toBe("7");
	});

	it("emphasises no root when the chord root is unknown", () => {
		const scale = scaleMarks(cMajor, NECK, "note");
		const overlay = overlayChordTones(scale, chordTonesFromMidi(C_MAJOR), cMajor, NECK, "note");
		expect(overlay.some((m) => m.emphasis === "root")).toBe(false);
		expect(overlay.some((m) => m.emphasis === "chordTone")).toBe(true);
	});

	it("only emits marks inside the window, whatever the scale marks covered", () => {
		const scale = scaleMarks(cMajor, NECK, "note");
		const window = { fromFret: 5, toFret: 9 };
		const overlay = overlayChordTones(scale, chordTonesFromMidi(C_MAJOR, 0), cMajor, window, "note");
		expect(overlay.length).toBeGreaterThan(0);
		for (const m of overlay) {
			expect(m.fret).toBeGreaterThanOrEqual(5);
			expect(m.fret).toBeLessThanOrEqual(9);
		}
	});

	it("keeps marks ordered low E first, nut to body", () => {
		const scale = scaleMarks(cMajor, NECK, "note");
		const overlay = overlayChordTones(scale, chordTonesFromMidi(C_MAJOR, 0), cMajor, NECK, "note");
		const order = overlay.map((m) => m.string * 100 + m.fret);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
	});
});
