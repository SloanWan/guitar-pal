import { describe, it, expect, vi } from "vitest";
import {
	toBars,
	barsToLegacyBeats,
	validateBars,
	selectRefVoicing,
	chordRefToMidi,
	resolveBarChords,
	MAX_CELLS_PER_BEAT,
} from "@/lib/strumBars";
import type { Bar, ChordRef, StrumPattern } from "@/lib/strumPatterns";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

function voicing(overrides: Partial<ChordVoicing>): ChordVoicing {
	return {
		id: "test",
		label: null,
		start_fret: 1,
		barre_fret: null,
		capo: false,
		frets: "000000",
		fingers: "000000",
		...overrides,
	};
}

function pattern(overrides: Partial<StrumPattern>): StrumPattern {
	return {
		id: "p1",
		name: "test",
		description: "",
		beats: [["D", "UG"]],
		...overrides,
	};
}

// Open C major (x32010): C3 E3 G3 C4 E4 — the voicing the strum engine plays.
const C_MAJOR = voicing({ id: "c-std", label: "Standard", frets: "x32010", fingers: "032010" });
// Barre C at the 3rd fret, used as the non-standard alternative.
const C_BARRE = voicing({ id: "c-barre", label: "Barre", start_fret: 3, frets: "x13331", fingers: "013331" });
const C_MAJOR_PITCHES = [48, 52, 55, 60, 64];

const C_REF: ChordRef = { root: "C", suffix: "major" };
const G_REF: ChordRef = { root: "G", suffix: "major" };

describe("toBars — the single read path", () => {
	it("lifts a legacy pattern into one chordless bar", () => {
		const p = pattern({ beats: [["D", "UG"], ["DG", "U"]] });
		expect(toBars(p)).toEqual([{ beats: p.beats, chord: null }]);
	});

	it("returns the stored bars when the pattern has them", () => {
		const bars: Bar[] = [
			{ beats: [["D", "UG"]], chord: C_REF },
			{ beats: [["DG", "U"]], chord: G_REF },
		];
		expect(toBars(pattern({ bars }))).toBe(bars);
	});

	it("prefers bars over the legacy beats field when both are present", () => {
		const bars: Bar[] = [{ beats: [["X", "X"]], chord: null }];
		const p = pattern({ beats: [["D", "UG"]], bars });
		expect(toBars(p)[0].beats).toEqual([["X", "X"]]);
	});

	it("every preset normalizes to a single valid bar", () => {
		for (const preset of PRESET_STRUM_PATTERNS) {
			const bars = toBars(preset);
			expect(bars).toHaveLength(1);
			expect(bars[0].chord).toBeNull();
			expect(bars[0].beats).toBe(preset.beats);
			expect(validateBars(bars).ok).toBe(true);
		}
	});
});

describe("barsToLegacyBeats — the double-write source", () => {
	it("keeps only the first bar's beats", () => {
		const bars: Bar[] = [
			{ beats: [["D", "UG"]], chord: C_REF },
			{ beats: [["X", "X"]], chord: G_REF },
		];
		expect(barsToLegacyBeats(bars)).toEqual([["D", "UG"]]);
	});

	it("round-trips a legacy pattern unchanged", () => {
		const p = pattern({ beats: [["D", "UG"], ["DG", "U"]] });
		expect(barsToLegacyBeats(toBars(p))).toEqual(p.beats);
	});

	it("returns an empty list for empty bars rather than throwing", () => {
		expect(barsToLegacyBeats([])).toEqual([]);
	});
});

describe("validateBars", () => {
	it("accepts a multi-bar pattern with per-bar chords", () => {
		const bars: Bar[] = [
			{ beats: [["D", "UG"], ["D", "U"]], chord: C_REF },
			{ beats: [["D3", "U3", "D3"]], chord: { ...G_REF, voicingId: "g-std" } },
			{ beats: [["D", "U", "D", "U"]], chord: null },
		];
		expect(validateBars(bars)).toEqual({ ok: true, errors: [] });
	});

	it("rejects a non-array", () => {
		const result = validateBars({ beats: [] });
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(/must be an array/);
	});

	it("rejects an empty bars list", () => {
		const result = validateBars([]);
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(/at least one bar/);
	});

	it("rejects a bar with zero beats", () => {
		const result = validateBars([{ beats: [], chord: null }]);
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(/bar 0: must contain at least one beat/);
	});

	it("rejects a beat with more than 4 cells", () => {
		const result = validateBars([
			{ beats: [["D", "U", "D", "U", "D"]], chord: null },
		]);
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(
			new RegExp(`bar 0 beat 0: has 5 cells, max is ${MAX_CELLS_PER_BEAT}`),
		);
	});

	it("rejects a beat with zero cells", () => {
		const result = validateBars([{ beats: [[]], chord: null }]);
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(/at least one cell/);
	});

	it("rejects a chord missing its root or suffix", () => {
		const result = validateBars([
			{ beats: [["D"]], chord: { root: "", suffix: "major" } },
		]);
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(/chord.root/);
	});

	it("reports every problem at once, not just the first", () => {
		const result = validateBars([
			{ beats: [], chord: null },
			{ beats: [["D", "U", "D", "U", "D"]], chord: null },
		]);
		expect(result.errors).toHaveLength(2);
	});
});

describe("selectRefVoicing", () => {
	it("uses the pinned voicingId when it resolves", () => {
		const ref: ChordRef = { ...C_REF, voicingId: "c-barre" };
		expect(selectRefVoicing(ref, [C_MAJOR, C_BARRE])).toBe(C_BARRE);
	});

	it("falls back to the standard voicing when voicingId is absent", () => {
		expect(selectRefVoicing(C_REF, [C_BARRE, C_MAJOR])).toBe(C_MAJOR);
	});

	it("falls back to the standard voicing when the pinned id no longer exists", () => {
		const ref: ChordRef = { ...C_REF, voicingId: "deleted" };
		expect(selectRefVoicing(ref, [C_BARRE, C_MAJOR])).toBe(C_MAJOR);
	});

	it("returns null when the chord has no voicings", () => {
		expect(selectRefVoicing(C_REF, [])).toBeNull();
	});
});

describe("chordRefToMidi — the ChordRef → pitch boundary", () => {
	it("resolves a chord identity to the standard voicing's pitches", () => {
		expect(chordRefToMidi(C_REF, [C_MAJOR])).toEqual(C_MAJOR_PITCHES);
	});

	it("returns null for a bar with no chord", () => {
		expect(chordRefToMidi(null, [C_MAJOR])).toBeNull();
	});

	it("returns null when the chord has no voicings", () => {
		expect(chordRefToMidi(C_REF, [])).toBeNull();
	});

	it("returns null when every string of the voicing is muted", () => {
		const silent = voicing({ label: "Standard", frets: "xxxxxx", fingers: "000000" });
		expect(chordRefToMidi(C_REF, [silent])).toBeNull();
	});
});

describe("resolveBarChords", () => {
	it("resolves each bar in order and leaves chordless bars null", async () => {
		const G_MAJOR = voicing({ id: "g-std", label: "Standard", frets: "320003", fingers: "210003" });
		const bars: Bar[] = [
			{ beats: [["D"]], chord: C_REF },
			{ beats: [["D"]], chord: null },
			{ beats: [["D"]], chord: G_REF },
		];
		const lookup = vi.fn(async (ref: ChordRef) =>
			ref.root === "C" ? [C_MAJOR] : [G_MAJOR],
		);

		expect(await resolveBarChords(bars, lookup)).toEqual([
			C_MAJOR_PITCHES,
			null,
			[43, 47, 50, 55, 59, 67],
		]);
	});

	it("fetches each distinct chord identity only once", async () => {
		const bars: Bar[] = [
			{ beats: [["D"]], chord: C_REF },
			{ beats: [["D"]], chord: G_REF },
			{ beats: [["D"]], chord: C_REF },
			{ beats: [["D"]], chord: G_REF },
		];
		const lookup = vi.fn(async () => [C_MAJOR]);

		await resolveBarChords(bars, lookup);

		expect(lookup).toHaveBeenCalledTimes(2);
	});

	it("yields null for a chord the lookup cannot find", async () => {
		const bars: Bar[] = [{ beats: [["D"]], chord: C_REF }];
		expect(await resolveBarChords(bars, async () => null)).toEqual([null]);
	});
});
