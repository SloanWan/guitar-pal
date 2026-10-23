import { describe, it, expect } from "vitest";
import {
	alignToRhythm,
	extraBarsFromColumn,
	followsRhythm,
	patternRhythm,
	progressionPlayback,
	rhythmBarAt,
	rhythmOfBars,
	toBars,
	withRhythm,
} from "@/lib/strumRhythm";
import { validateBars } from "@/lib/strumBars";
import { PRESET_STRUM_PATTERNS, type Bar, type Beat, type ChordRef, type StrumPattern } from "@/lib/strumPatterns";

const A: Beat[] = [["D", ""], ["D", "U"], ["", "U"], ["D", ""]];
const B: Beat[] = [["D", ""], ["", ""], ["D", "U"], ["D", ""]];
const C: ChordRef = { root: "C", suffix: "major" };
const G: ChordRef = { root: "G", suffix: "major" };
const AM: ChordRef = { root: "A", suffix: "minor" };

function pattern(overrides: Partial<StrumPattern> = {}): StrumPattern {
	return { id: "p", name: "p", beats: A, ...overrides };
}

describe("patternRhythm / toBars — the single read path", () => {
	it("reads a one-bar pattern as one chordless bar", () => {
		expect(toBars(pattern())).toEqual([{ beats: A, chord: null }]);
	});

	it("reads every bar of a longer rhythm, in order", () => {
		expect(patternRhythm(pattern({ extraBars: [B] }))).toEqual([A, B]);
	});

	it("folds retired step values on the way in", () => {
		expect(toBars(pattern({ beats: [["D", "UG" as never]] }))[0].beats).toEqual([["D", ""]]);
	});

	it("every preset normalizes to a single valid bar", () => {
		for (const preset of PRESET_STRUM_PATTERNS) {
			const bars = toBars(preset);
			expect(bars).toHaveLength(1);
			expect(bars[0].beats).toEqual(preset.beats);
			expect(validateBars(bars).ok).toBe(true);
		}
	});
});

describe("withRhythm", () => {
	it("puts the first bar in beats and the rest in extraBars", () => {
		const next = withRhythm(pattern(), [B, A]);
		expect(next.beats).toEqual(B);
		expect(next.extraBars).toEqual([A]);
	});

	it("drops extraBars entirely for a one-bar rhythm", () => {
		expect(withRhythm(pattern({ extraBars: [B] }), [A])).not.toHaveProperty("extraBars");
	});

	it("copies, so editing the result cannot reach back into the input", () => {
		const rhythm = [A.map((beat) => [...beat])];
		const next = withRhythm(pattern(), rhythm);
		next.beats[0][0] = "X";
		expect(rhythm[0][0][0]).toBe("D");
	});
});

describe("extraBarsFromColumn", () => {
	it("returns undefined for anything that is not a multi-bar rhythm", () => {
		expect(extraBarsFromColumn(A, null)).toBeUndefined();
		expect(extraBarsFromColumn(A, [{ beats: A, chord: null }])).toBeUndefined();
		expect(extraBarsFromColumn(A, "junk")).toBeUndefined();
	});
});

describe("progressionPlayback — chords laid over the rhythm", () => {
	const chords = (refs: ChordRef[]): { bars: Bar[] } => ({
		bars: refs.map((chord) => ({ beats: [["X"]], chord })),
	});

	it("plays the rhythm alone when no sequence is open", () => {
		expect(progressionPlayback([A, B], null)).toEqual([
			{ beats: A, chord: null },
			{ beats: B, chord: null },
		]);
	});

	it("plays every chord over the pattern's rhythm, never its own stored beats", () => {
		const bars = progressionPlayback([A], chords([C, G]));
		expect(bars.map((b) => b.beats)).toEqual([A, A]);
		expect(bars.map((b) => b.chord)).toEqual([C, G]);
	});

	it("runs a short rhythm round under a longer sequence", () => {
		const bars = progressionPlayback([A, B], chords([C, G, AM, G]));
		expect(bars.map((b) => b.beats)).toEqual([A, B, A, B]);
	});

	it("holds a short sequence across a longer rhythm", () => {
		const bars = progressionPlayback([A, B], chords([C]));
		expect(bars.map((b) => b.chord)).toEqual([C, C]);
		expect(bars.map((b) => b.beats)).toEqual([A, B]);
	});

	it("keeps a bar kept under a name nobody has a chord for", () => {
		const bars = progressionPlayback([A], { bars: [{ beats: A, chord: null, unknownChord: "Xm" }] });
		expect(bars[0].unknownChord).toBe("Xm");
	});
});

describe("rhythmBarAt", () => {
	it("wraps in both directions", () => {
		expect(rhythmBarAt([A, B], 3)).toBe(B);
		expect(rhythmBarAt([A, B], -1)).toBe(B);
	});
});

describe("alignToRhythm / followsRhythm", () => {
	it("returns the same array when every bar already plays the rhythm", () => {
		const bars: Bar[] = [
			{ beats: A, chord: C },
			{ beats: B, chord: G },
		];
		expect(followsRhythm(bars, [A, B])).toBe(true);
		expect(alignToRhythm(bars, [A, B])).toBe(bars);
	});

	it("rewrites the beats and nothing else", () => {
		const bars: Bar[] = [{ beats: B, chord: C, unknownChord: undefined }];
		const aligned = alignToRhythm(bars, [A]);
		expect(aligned[0]).toEqual({ beats: A, chord: C, unknownChord: undefined });
		expect(followsRhythm(bars, [A])).toBe(false);
	});
});

describe("rhythmOfBars", () => {
	const bar = (beats: Beat[]): Bar => ({ beats, chord: null });

	it("finds one bar under four of the same", () => {
		expect(rhythmOfBars([bar(A), bar(A), bar(A), bar(A)])).toEqual([A]);
	});

	it("finds the repeat in A B A B", () => {
		expect(rhythmOfBars([bar(A), bar(B), bar(A), bar(B)])).toEqual([A, B]);
	});

	it("keeps a run that never repeats whole", () => {
		expect(rhythmOfBars([bar(A), bar(B), bar(B)])).toEqual([A, B, B]);
	});

	it("round-trips through progressionPlayback", () => {
		const bars = [bar(A), bar(B), bar(A), bar(B)];
		const rhythm = rhythmOfBars(bars);
		expect(followsRhythm(bars, rhythm)).toBe(true);
	});
});
