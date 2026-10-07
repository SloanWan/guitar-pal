import { describe, expect, it } from "vitest";
import { CHORD_DEMO_VOICINGS, chordsStage, pitchClassOfName, stringTones } from "../chordsStage";

describe("chordsStage", () => {
	it("walks the root from C to A over the first phase", () => {
		expect(chordsStage(0).voicingIndex).toBe(0);
		expect(chordsStage(0.2).voicingIndex).toBe(2);
		expect(chordsStage(0.58).voicingIndex).toBe(5);
		expect(chordsStage(1).voicingIndex).toBe(5);
	});
	it("then sounds the strings low to high, and rests before and after", () => {
		expect(chordsStage(0.5).ringingString).toBeNull();
		expect(chordsStage(0.63).ringingString).toBe(6);
		expect(chordsStage(0.75).ringingString).toBe(3);
		expect(chordsStage(0.87).ringingString).toBe(1);
		expect(chordsStage(0.95).ringingString).toBeNull();
	});
});

describe("stringTones", () => {
	const by = (name: string) => CHORD_DEMO_VOICINGS.find((v) => v.name === name)!;
	it("names each open-string voicing's tones from the shape", () => {
		expect(stringTones(by("C"))).toEqual([null, "C", "E", "G", "C", "E"]);
		expect(stringTones(by("G"))).toEqual(["G", "B", "D", "G", "B", "G"]);
	});
	it("spells with the chord's own accidentals", () => {
		expect(stringTones(by("E"))).toEqual(["E", "B", "E", "G#", "B", "E"]);
		expect(stringTones(by("A"))).toEqual([null, "A", "E", "A", "C#", "E"]);
	});
	it("reads the barre chord's absolute frets", () => {
		expect(stringTones(by("F"))).toEqual(["F", "C", "F", "A", "C", "F"]);
	});
	it("every demo voicing sounds only its chord tones", () => {
		for (const v of CHORD_DEMO_VOICINGS) {
			for (const t of stringTones(v)) if (t !== null) expect(v.tones).toContain(t);
		}
	});
});

describe("pitchClassOfName", () => {
	it("reads naturals, sharps and flats", () => {
		expect(pitchClassOfName("C")).toBe(0);
		expect(pitchClassOfName("F#")).toBe(6);
		expect(pitchClassOfName("Bb")).toBe(10);
		expect(pitchClassOfName("Cb")).toBe(11);
	});
	it("rejects nonsense", () => {
		expect(() => pitchClassOfName("H")).toThrow();
	});
});
