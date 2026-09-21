import { describe, it, expect } from "vitest";
import { makeEmptySlot } from "@/lib/fingerpickEdit";
import {
	JIANPU_DOT_ABOVE,
	JIANPU_DOT_BELOW,
	OPEN_STRING_MIDI,
	isPitchLabelStyle,
	pitchLabel,
	slotPitchLabels,
	soundingMidi,
	splitPitchLabel,
} from "@/lib/fingerpickPitch";

describe("soundingMidi", () => {
	it("is the open string at fret 0 with no capo", () => {
		OPEN_STRING_MIDI.forEach((open, stringIndex) => {
			expect(soundingMidi(stringIndex, 0, 0)).toBe(open);
		});
	});

	it("adds the fret", () => {
		expect(soundingMidi(5, 3, 0)).toBe(43); // low E, 3rd fret = G2
		expect(soundingMidi(0, 12, 0)).toBe(76); // high e, 12th fret = E5
	});

	it("folds the capo in: capo 2, 6th string fret 3 sounds A", () => {
		expect(soundingMidi(5, 3, 2)).toBe(45);
		expect(pitchLabel(soundingMidi(5, 3, 2), "name")).toBe("A");
	});
});

describe("pitchLabel", () => {
	it("writes MIDI as the number", () => {
		expect(pitchLabel(64, "midi")).toBe("64");
	});

	it("spells names the way the chord library spells its roots", () => {
		expect(pitchLabel(61, "name")).toBe("C#");
		expect(pitchLabel(63, "name")).toBe("Eb");
		expect(pitchLabel(66, "name")).toBe("F#");
		expect(pitchLabel(68, "name")).toBe("Ab");
		expect(pitchLabel(70, "name")).toBe("Bb");
	});

	it("writes scientific pitch with middle C as C4", () => {
		expect(pitchLabel(60, "scientific")).toBe("C4");
		expect(pitchLabel(64, "scientific")).toBe("E4");
		expect(pitchLabel(40, "scientific")).toBe("E2");
		expect(pitchLabel(59, "scientific")).toBe("B3");
		expect(pitchLabel(66, "scientific")).toBe("F#4");
	});

	it("writes jianpu fixed-do in C, the open strings as the primers chart them", () => {
		expect(OPEN_STRING_MIDI.map((m) => pitchLabel(m, "jianpu"))).toEqual([
			`3${JIANPU_DOT_ABOVE}`, // high e: E4
			"7", // B3
			"5", // G3
			"2", // D3
			`6${JIANPU_DOT_BELOW}`, // A2
			`3${JIANPU_DOT_BELOW}`, // E2
		]);
	});

	it("writes jianpu accidentals before the degree, in the library's spelling", () => {
		expect(pitchLabel(61, "jianpu")).toBe(`#1${JIANPU_DOT_ABOVE}`); // C#4
		expect(pitchLabel(51, "jianpu")).toBe("b3"); // Eb3
		expect(pitchLabel(46, "jianpu")).toBe(`b7${JIANPU_DOT_BELOW}`); // Bb2
	});

	it("stacks jianpu dots for a second octave either way", () => {
		expect(pitchLabel(72, "jianpu")).toBe(`1${JIANPU_DOT_ABOVE}${JIANPU_DOT_ABOVE}`); // C5
		expect(pitchLabel(24, "jianpu")).toBe(`1${JIANPU_DOT_BELOW}${JIANPU_DOT_BELOW}`); // C1
	});

	it("covers every open string", () => {
		expect(OPEN_STRING_MIDI.map((m) => pitchLabel(m, "scientific"))).toEqual([
			"E4",
			"B3",
			"G3",
			"D3",
			"A2",
			"E2",
		]);
	});
});

describe("splitPitchLabel", () => {
	it("takes the octave dots off the visible text", () => {
		expect(splitPitchLabel(`#4${JIANPU_DOT_ABOVE}${JIANPU_DOT_ABOVE}`)).toEqual({
			base: "#4",
			dotsAbove: 2,
			dotsBelow: 0,
		});
		expect(splitPitchLabel(`6${JIANPU_DOT_BELOW}`)).toEqual({ base: "6", dotsAbove: 0, dotsBelow: 1 });
		expect(splitPitchLabel("F#4")).toEqual({ base: "F#4", dotsAbove: 0, dotsBelow: 0 });
	});
});

describe("isPitchLabelStyle", () => {
	it("accepts the four styles and nothing else", () => {
		expect(isPitchLabelStyle("name")).toBe(true);
		expect(isPitchLabelStyle("scientific")).toBe(true);
		expect(isPitchLabelStyle("midi")).toBe(true);
		expect(isPitchLabelStyle("jianpu")).toBe(true);
		expect(isPitchLabelStyle("E4")).toBe(false);
		expect(isPitchLabelStyle(null)).toBe(false);
	});
});

describe("slotPitchLabels", () => {
	const scientific = (stringIndex: number, fret: number) =>
		pitchLabel(soundingMidi(stringIndex, fret, 0), "scientific");

	it("labels every played string in string order, high e first", () => {
		const slot = makeEmptySlot("quarter");
		slot.strings[5] = { fret: 3, technique: null, tied: false, muted: false };
		slot.strings[1] = { fret: 1, technique: null, tied: false, muted: false };
		slot.strings[0] = { fret: 0, technique: null, tied: false, muted: false };
		expect(slotPitchLabels(slot, scientific)).toEqual([
			{ stringIndex: 0, text: "E4", tied: false },
			{ stringIndex: 1, text: "C4", tied: false },
			{ stringIndex: 5, text: "G2", tied: false },
		]);
	});

	it("skips muted strings and strings not in play", () => {
		const slot = makeEmptySlot("quarter");
		slot.strings[5] = { fret: null, technique: null, tied: false, muted: true };
		slot.strings[4] = { fret: 2, technique: null, tied: false, muted: true };
		slot.strings[2] = { fret: 0, technique: null, tied: false, muted: false };
		expect(slotPitchLabels(slot, scientific)).toEqual([{ stringIndex: 2, text: "G3", tied: false }]);
	});

	it("keeps a tied string, marked as tied", () => {
		const slot = makeEmptySlot("quarter");
		slot.strings[3] = { fret: 2, technique: null, tied: true, muted: false };
		expect(slotPitchLabels(slot, scientific)).toEqual([{ stringIndex: 3, text: "E3", tied: true }]);
	});

	it("gives a rest or a grace slot nothing", () => {
		const rest = makeEmptySlot("quarter");
		rest.isRest = true;
		rest.strings[5] = { fret: 3, technique: null, tied: false, muted: false };
		expect(slotPitchLabels(rest, scientific)).toEqual([]);
		const grace = makeEmptySlot("eighth");
		grace.isGraceNote = true;
		grace.strings[5] = { fret: 3, technique: null, tied: false, muted: false };
		expect(slotPitchLabels(grace, scientific)).toEqual([]);
	});
});
