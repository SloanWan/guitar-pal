import { describe, expect, it } from "vitest";
import { FRETBOARD_DEMO_KEY_CHORDS, FRETBOARD_DEMO_WINDOW, fretboardStage } from "../fretboardStage";

describe("fretboardStage", () => {
	const full = fretboardStage(0.45).marks;

	it("lights the pentatonic fret by fret, lowest frets first", () => {
		expect(fretboardStage(0).marks).toHaveLength(0);
		const half = fretboardStage(0.225).marks;
		expect(half.length).toBe(Math.round(full.length / 2));
		expect(half.map((m) => m.fret)).toEqual([...half.map((m) => m.fret)].sort((a, b) => a - b));
		expect(full.every((m) => m.fret >= FRETBOARD_DEMO_WINDOW.fromFret && m.fret <= FRETBOARD_DEMO_WINDOW.toFret)).toBe(
			true,
		);
	});

	it("is only the scale's five notes, with A as its root", () => {
		expect(new Set(full.map((m) => m.label))).toEqual(new Set(["A", "C", "D", "E", "G"]));
		expect(full.filter((m) => m.emphasis === "root").every((m) => m.label === "A")).toBe(true);
		expect(fretboardStage(0.45).chord).toBeNull();
		expect(fretboardStage(0.45).position).toBe("SCALE");
	});

	it("then lays Am over it: A, C and E are chord tones, D and G fall back", () => {
		const s = fretboardStage(0.6);
		expect(s.chord).toBe("Am");
		expect(s.position).toBe("SCALE + CHORD Am");
		const by = (label: string) => s.marks.filter((m) => m.label === label);
		expect(by("A").every((m) => m.emphasis === "root")).toBe(true);
		expect(by("C").every((m) => m.emphasis === "chordTone" && m.tone === "third")).toBe(true);
		expect(by("E").every((m) => m.emphasis === "chordTone" && m.tone === "fifth")).toBe(true);
		expect(by("D").every((m) => m.emphasis === "scaleTone")).toBe(true);
		expect(by("G").every((m) => m.emphasis === "scaleTone")).toBe(true);
		expect(s.marks).toHaveLength(full.length);
	});

	it("brings the piano in last", () => {
		expect(fretboardStage(0.7).piano).toBe(false);
		expect(fretboardStage(0.8).piano).toBe(true);
	});

	it("names the key's seven chords, Am first", () => {
		expect(FRETBOARD_DEMO_KEY_CHORDS.map((c) => c.numeral)).toEqual(["i", "ii°", "III", "iv", "v", "VI", "VII"]);
		expect(FRETBOARD_DEMO_KEY_CHORDS[0]).toMatchObject({ root: "A", suffix: "minor", diatonic: true });
	});
});
