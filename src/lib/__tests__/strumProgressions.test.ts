import { describe, it, expect } from "vitest";
import {
	parseChordSequence,
	hasShapeToken,
	progressionBarsFromTokens,
	keptTokens,
	chordAbbreviation,
	defaultProgressionName,
	progressionDisplayName,
	sortProgressions,
	nextOrderIndex,
	progressionsForPattern,
	normalizeCapo,
	progressionCapo,
	NO_CHORD_LABEL,
} from "@/lib/strumProgressions";
import { STRUM_CAPO_MAX } from "@/lib/strumPatterns";
import type { Bar, Beat, ChordProgression } from "@/lib/strumPatterns";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { parseTabSequence } from "@/lib/chordTabSequence";

function progression(overrides: Partial<ChordProgression>): ChordProgression {
	return {
		id: "pr1",
		patternId: "4-4 old faithful",
		bars: [{ beats: [["D", ""]], chord: null }],
		orderIndex: 0,
		...overrides,
	};
}

describe("normalizeCapo", () => {
	it("keeps a fret in range", () => {
		expect(normalizeCapo(2)).toBe(2);
		expect(normalizeCapo(STRUM_CAPO_MAX)).toBe(STRUM_CAPO_MAX);
	});

	it("clamps below zero and above the highest offered fret", () => {
		expect(normalizeCapo(-3)).toBe(0);
		expect(normalizeCapo(40)).toBe(STRUM_CAPO_MAX);
	});

	it("rounds a fractional fret", () => {
		expect(normalizeCapo(2.4)).toBe(2);
		expect(normalizeCapo(2.6)).toBe(3);
	});

	it("reads a missing or unusable value as no capo", () => {
		expect(normalizeCapo(undefined)).toBe(0);
		expect(normalizeCapo(null)).toBe(0);
		expect(normalizeCapo(NaN)).toBe(0);
		expect(normalizeCapo("2")).toBe(0);
	});

	it("reads a progression's capo, defaulting to none", () => {
		expect(progressionCapo(progression({ capo: 5 }))).toBe(5);
		expect(progressionCapo(progression({}))).toBe(0);
		expect(progressionCapo(null)).toBe(0);
	});
});

describe("progression naming", () => {
	it("abbreviates chords the way a chart does", () => {
		expect(chordAbbreviation({ root: "C", suffix: "major" })).toBe("C");
		expect(chordAbbreviation({ root: "A", suffix: "minor" })).toBe("Am");
		expect(chordAbbreviation({ root: "G", suffix: "7" })).toBe("G7");
		expect(chordAbbreviation({ root: "C", suffix: "/G" })).toBe("C/G");
	});

	it("names an unnamed progression after its chords, pipe separated", () => {
		const bars: Bar[] = [
			{ beats: [["D"]], chord: { root: "C", suffix: "major" } },
			{ beats: [["D"]], chord: { root: "A", suffix: "minor" } },
		];
		expect(defaultProgressionName(bars)).toBe("C|Am");
	});

	it("marks bars with no chord picked yet", () => {
		const bars: Bar[] = [
			{ beats: [["D"]], chord: { root: "G", suffix: "major" } },
			{ beats: [["D"]], chord: null },
		];
		expect(defaultProgressionName(bars)).toBe(`G|${NO_CHORD_LABEL}`);
		expect(defaultProgressionName([])).toBe(NO_CHORD_LABEL);
	});

	it("lists a bar kept as a name under that name, not as a blank", () => {
		const bars: Bar[] = [
			{ beats: [["D"]], chord: { root: "C", suffix: "major" } },
			{ beats: [["D"]], chord: null, unknownChord: "Cadd9#11" },
		];
		expect(defaultProgressionName(bars)).toBe("C|Cadd9#11");
	});

	it("prefers a user-given name, ignoring a blank one", () => {
		const bars: Bar[] = [{ beats: [["D"]], chord: { root: "C", suffix: "major" } }];
		expect(progressionDisplayName(progression({ bars, name: "Verse" }))).toBe("Verse");
		expect(progressionDisplayName(progression({ bars, name: "   " }))).toBe("C");
		expect(progressionDisplayName(progression({ bars }))).toBe("C");
	});
});

describe("ordering", () => {
	it("sorts by order index without mutating the input", () => {
		const list = [
			progression({ id: "b", orderIndex: 2 }),
			progression({ id: "a", orderIndex: 1 }),
		];
		expect(sortProgressions(list).map((p) => p.id)).toEqual(["a", "b"]);
		expect(list.map((p) => p.id)).toEqual(["b", "a"]);
	});

	it("appends after the highest index", () => {
		expect(nextOrderIndex([])).toBe(0);
		expect(
			nextOrderIndex([progression({ orderIndex: 0 }), progression({ orderIndex: 4 })]),
		).toBe(5);
	});
});

describe("progressionsForPattern", () => {
	it("keeps only the pattern's own progressions, in order", () => {
		const list = [
			progression({ id: "other", patternId: "muted", orderIndex: 0 }),
			progression({ id: "second", orderIndex: 1 }),
			progression({ id: "first", orderIndex: 0 }),
		];
		expect(progressionsForPattern(list, "4-4 old faithful").map((p) => p.id)).toEqual([
			"first",
			"second",
		]);
	});
});

// A slice of the real index: the roots and qualities the tests type.
const INDEX: readonly ChordIndexEntry[] = [
	{ root: "C", suffix: "major" },
	{ root: "C", suffix: "minor" },
	{ root: "C", suffix: "/G" },
	{ root: "G", suffix: "major" },
	{ root: "G", suffix: "7" },
	{ root: "A", suffix: "major" },
	{ root: "A", suffix: "minor" },
	{ root: "F", suffix: "major" },
	{ root: "Eb", suffix: "major" },
];

describe("parseChordSequence", () => {
	it("never reads a bare number as a chord", () => {
		const { chords, unmatched } = parseChordSequence("Am 5 3 2 1", INDEX);
		expect(chords.map((c) => c.root)).toEqual(["A"]);
		expect(unmatched).toEqual(["5", "3", "2", "1"]);
	});

	it("reads a space-separated sequence", () => {
		const { chords, unmatched } = parseChordSequence("C G Am F", INDEX);
		expect(unmatched).toEqual([]);
		expect(chords).toEqual([
			{ root: "C", suffix: "major", voicingId: null },
			{ root: "G", suffix: "major", voicingId: null },
			{ root: "A", suffix: "minor", voicingId: null },
			{ root: "F", suffix: "major", voicingId: null },
		]);
	});

	it("accepts dashes, commas and pipes as separators", () => {
		expect(parseChordSequence("C - G", INDEX).chords).toHaveLength(2);
		expect(parseChordSequence("C,G,Am", INDEX).chords).toHaveLength(3);
		expect(parseChordSequence("C | G", INDEX).chords).toHaveLength(2);
	});

	it("splits a dashed chord line with no spaces", () => {
		// The way a chord line is most often written, and the one case the
		// separator list could not take on its own without breaking dashed shapes.
		const { chords, unmatched } = parseChordSequence("C-G-Am-F", INDEX);
		expect(unmatched).toEqual([]);
		expect(chords.map((c) => c.root)).toEqual(["C", "G", "A", "F"]);
		expect(parseChordSequence("C–G—Am", INDEX).chords).toHaveLength(3);
	});

	it("keeps a dashed shape as one token", () => {
		const { tokens } = parseChordSequence("0-1-0-2-2-0", INDEX);
		expect(tokens).toHaveLength(1);
		expect(tokens[0].shape).toBe(true);
	});

	it("resolves the same spellings the chord picker accepts", () => {
		expect(parseChordSequence("g7", INDEX).chords[0]).toMatchObject({
			root: "G",
			suffix: "7",
		});
		expect(parseChordSequence("D#", INDEX).chords[0]).toMatchObject({ root: "Eb" });
		expect(parseChordSequence("C/G", INDEX).chords[0]).toMatchObject({ suffix: "/G" });
	});

	it("reports tokens no chord matches, keeping the rest", () => {
		const { chords, unmatched } = parseChordSequence("C zzz G", INDEX);
		expect(chords).toHaveLength(2);
		expect(unmatched).toEqual(["zzz"]);
	});

	it("reads an empty input as no chords", () => {
		expect(parseChordSequence("   ", INDEX)).toEqual({
			tokens: [],
			chords: [],
			unmatched: [],
		});
	});

	it("keeps every token in typed order for the live preview", () => {
		const { tokens } = parseChordSequence("C zzz Am", INDEX);
		expect(tokens.map((t) => t.input)).toEqual(["C", "zzz", "Am"]);
		expect(tokens.map((t) => t.chord?.root ?? null)).toEqual(["C", null, "A"]);
	});
});

describe("a shape written into a chord sequence", () => {
	// Stands in for the voicing lookup: only this one grip is held by anything.
	const HELD = "01023x";
	const resolve = (frets: (number | "x")[]) =>
		frets.join(",") === parseTabSequence(HELD).frets!.join(",")
			? { root: "C", suffix: "major", voicingId: "lib-1" }
			: null;

	it("resolves a written shape to the chord held that way, pinned to it", () => {
		const { tokens } = parseChordSequence(`G ${HELD}`, INDEX, resolve);
		expect(tokens[0].shape).toBeUndefined();
		expect(tokens[1]).toMatchObject({
			input: HELD,
			shape: true,
			chord: { root: "C", suffix: "major", voicingId: "lib-1" },
		});
	});

	it("leaves a shape nothing is held with unresolved, and says it was a shape", () => {
		const { tokens, unmatched } = parseChordSequence("007707", INDEX, resolve);
		expect(tokens[0]).toMatchObject({ input: "007707", shape: true, chord: null });
		expect(unmatched).toEqual(["007707"]);
	});

	it("reads a dashed shape, which is how one survives a URL", () => {
		expect(parseChordSequence("x-3-2-0-1-0", INDEX, resolve).tokens[0].shape).toBe(true);
	});

	it("resolves nothing without a lookup, rather than guessing", () => {
		expect(parseChordSequence(HELD, INDEX).tokens[0]).toMatchObject({
			shape: true,
			chord: null,
		});
	});

	it("never reads a chord name as a shape", () => {
		const { tokens } = parseChordSequence("C G Am F", INDEX, resolve);
		expect(tokens.every((t) => t.shape === undefined)).toBe(true);
	});

	describe("hasShapeToken — asked before the voicings are fetched", () => {
		it("is true only when a shape is actually written", () => {
			expect(hasShapeToken("C G Am F")).toBe(false);
			expect(hasShapeToken("C 007707 G")).toBe(true);
			expect(hasShapeToken("")).toBe(false);
		});
	});
});

describe("keptTokens — the answer to the unknown-chord prompt", () => {
	const TOKENS = parseChordSequence("C zzz G", INDEX).tokens;

	it("drops the words no chord matched when the answer is skip", () => {
		expect(keptTokens(TOKENS, "skip").map((t) => t.input)).toEqual(["C", "G"]);
	});

	it("writes every word down when the answer is keep", () => {
		expect(keptTokens(TOKENS, "keep").map((t) => t.input)).toEqual(["C", "zzz", "G"]);
	});

	it("leaves the parsed tokens alone", () => {
		keptTokens(TOKENS, "keep").pop();
		expect(TOKENS).toHaveLength(3);
	});
});

describe("progressionBarsFromTokens", () => {
	it("gives every chord a bar of the pattern's rhythm", () => {
		const beats = [["D", ""], ["", "U"]];
		const bars = progressionBarsFromTokens([beats], parseChordSequence("C G", INDEX).tokens);
		expect(bars).toHaveLength(2);
		expect(bars[0].beats).toEqual(beats);
		expect(bars[1].chord).toMatchObject({ root: "G" });
		bars[0].beats[0][0] = "X";
		expect(beats[0][0]).toBe("D");
	});

	it("keeps a word the library could not match as the bar's name", () => {
		const beats: Beat[] = [["D", ""]];
		const bars = progressionBarsFromTokens([beats], parseChordSequence("C zzz", INDEX).tokens);
		expect(bars).toHaveLength(2);
		expect(bars[1].chord).toBeNull();
		expect(bars[1].unknownChord).toBe("zzz");
	});

	it("leaves a resolved bar with no name to carry", () => {
		const bars = progressionBarsFromTokens([[["D"]]], parseChordSequence("C", INDEX).tokens);
		expect(bars[0].unknownChord).toBeUndefined();
	});

	it("walks a longer rhythm bar by bar, and round again", () => {
		const a: Beat[] = [["D", ""]];
		const b: Beat[] = [["", "U"]];
		const bars = progressionBarsFromTokens([a, b], parseChordSequence("C G Am", INDEX).tokens);
		expect(bars.map((bar) => bar.beats)).toEqual([a, b, a]);
	});
});
