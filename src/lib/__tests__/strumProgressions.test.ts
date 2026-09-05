import { describe, it, expect } from "vitest";
import {
	parseChordSequence,
	progressionBarsFromChords,
	syncBarsToPattern,
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

function progression(overrides: Partial<ChordProgression>): ChordProgression {
	return {
		id: "pr1",
		patternId: "4-4 old faithful",
		bars: [{ beats: [["D", "UG"]], chord: null }],
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

describe("progressionBarsFromChords", () => {
	it("gives every chord a bar of the pattern's rhythm", () => {
		const beats = [["D", "UG"], ["DG", "U"]];
		const bars = progressionBarsFromChords(beats, [
			{ root: "C", suffix: "major", voicingId: null },
			{ root: "G", suffix: "major", voicingId: null },
		]);
		expect(bars).toHaveLength(2);
		expect(bars[0].beats).toEqual(beats);
		expect(bars[1].chord).toMatchObject({ root: "G" });
		bars[0].beats[0][0] = "X";
		expect(beats[0][0]).toBe("D");
	});
});

describe("syncBarsToPattern", () => {
	const OLD: Beat[] = [
		["D", "UG"],
		["D", "UG"],
	];
	const NEW: Beat[] = [
		["D", "U"],
		["DG", "U"],
	];
	const HAND_EDITED: Beat[] = [["X", "X"], ["D", "U"]];

	it("rewrites bars that still play the pattern's old rhythm, keeping their chords", () => {
		const bars: Bar[] = [
			{ beats: OLD.map((b) => [...b]), chord: { root: "C", suffix: "major" } },
			{ beats: OLD.map((b) => [...b]), chord: { root: "G", suffix: "major" } },
		];
		const next = syncBarsToPattern(bars, OLD, NEW);
		expect(next.map((b) => b.beats)).toEqual([NEW, NEW]);
		expect(next.map((b) => b.chord?.root)).toEqual(["C", "G"]);
	});

	it("leaves a bar the user re-wrote in the progression editor alone", () => {
		const bars: Bar[] = [
			{ beats: OLD.map((b) => [...b]), chord: null },
			{ beats: HAND_EDITED.map((b) => [...b]), chord: null },
		];
		const next = syncBarsToPattern(bars, OLD, NEW);
		expect(next[0].beats).toEqual(NEW);
		expect(next[1].beats).toEqual(HAND_EDITED);
	});

	it("returns the input untouched when the rhythm did not change", () => {
		const bars: Bar[] = [{ beats: OLD.map((b) => [...b]), chord: null }];
		expect(syncBarsToPattern(bars, OLD, OLD.map((b) => [...b]))).toBe(bars);
	});

	it("returns the input untouched when no bar matched the old rhythm", () => {
		const bars: Bar[] = [{ beats: HAND_EDITED.map((b) => [...b]), chord: null }];
		expect(syncBarsToPattern(bars, OLD, NEW)).toBe(bars);
	});

	it("copies the new beats per bar rather than sharing one array", () => {
		const bars: Bar[] = [
			{ beats: OLD.map((b) => [...b]), chord: null },
			{ beats: OLD.map((b) => [...b]), chord: null },
		];
		const next = syncBarsToPattern(bars, OLD, NEW);
		next[0].beats[0][0] = "X";
		expect(next[1].beats[0][0]).toBe("D");
		expect(NEW[0][0]).toBe("D");
	});
});
