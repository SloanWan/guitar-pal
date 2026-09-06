import { describe, it, expect, vi } from "vitest";
import {
	toBars,
	barsToLegacyBeats,
	validateBars,
	selectRefVoicing,
	chordRefToMidi,
	chordRefToDiagram,
	resolveBarChords,
	transposeBarPitches,
	normalizeBpm,
	patternBpm,
	patternMeter,
	bpmRangeForMeter,
	clampBpmToMeter,
	rescaleBpmForMeter,
} from "@/lib/strumBars";
import type { Bar, ChordRef, StrumPattern } from "@/lib/strumPatterns";
import {
	PRESET_STRUM_PATTERNS,
	DEFAULT_STRUM_BPM,
	STRUM_BPM_MAX,
	STRUM_BPM_MIN,
} from "@/lib/strumPatterns";
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
	it("reads a pattern as one chordless bar", () => {
		const p = pattern({ beats: [["D", "UG"], ["DG", "U"]] });
		expect(toBars(p)).toEqual([{ beats: p.beats, chord: null }]);
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

	it("rejects a cell count no meter divides a beat into", () => {
		// Five is not an unusually fine subdivision, it is corruption: no
		// supported meter produces it. Six is legal — a dotted beat in sixteenths.
		const result = validateBars([
			{ beats: [["D", "U", "D", "U", "D"]], chord: null },
		]);
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(/bar 0 beat 0: has 5 cells, allowed are/);
	});

	it("accepts a dotted beat divided into sixteenths", () => {
		const result = validateBars([
			{ beats: [["D", "", "U", "", "D", ""]], chord: null },
		]);
		expect(result.ok).toBe(true);
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

describe("chordRefToDiagram — the ChordRef → fretboard shape boundary", () => {
	it("draws the standard voicing when nothing is pinned", () => {
		const def = chordRefToDiagram(C_REF, [C_BARRE, C_MAJOR]);
		// x32010 at the nut: muted low E, then frets 3-2-0-1-0.
		expect(def).not.toBeNull();
		expect(def!.position).toBe(1);
		expect(def!.chord).toEqual([
			[6, "x"],
			[5, 3, "3"],
			[4, 2, "2"],
			[3, 0],
			[2, 1, "1"],
			[1, 0],
		]);
	});

	it("draws the pinned voicing, so the shape matches what sounds", () => {
		const def = chordRefToDiagram({ ...C_REF, voicingId: "c-barre" }, [C_MAJOR, C_BARRE]);
		expect(def!.position).toBe(3);
	});

	it("returns null for a bar with no chord, and for a chord with no voicings", () => {
		expect(chordRefToDiagram(null, [C_MAJOR])).toBeNull();
		expect(chordRefToDiagram(C_REF, [])).toBeNull();
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

describe("normalizeBpm", () => {
	it("keeps an in-range tempo", () => {
		expect(normalizeBpm(120)).toBe(120);
	});

	it("clamps to the fader bounds", () => {
		expect(normalizeBpm(10)).toBe(STRUM_BPM_MIN);
		expect(normalizeBpm(900)).toBe(STRUM_BPM_MAX);
	});

	it("rounds fractional tempos", () => {
		expect(normalizeBpm(99.6)).toBe(100);
	});

	it("falls back to the default for a missing or unusable value", () => {
		expect(normalizeBpm(undefined)).toBe(DEFAULT_STRUM_BPM);
		expect(normalizeBpm(null)).toBe(DEFAULT_STRUM_BPM);
		expect(normalizeBpm(NaN)).toBe(DEFAULT_STRUM_BPM);
		expect(normalizeBpm("120")).toBe(DEFAULT_STRUM_BPM);
	});
});

describe("patternBpm", () => {
	it("reads the pattern's own tempo", () => {
		expect(patternBpm({ ...PRESET_STRUM_PATTERNS[0], bpm: 132 })).toBe(132);
	});

	it("defaults a pattern that carries no tempo", () => {
		expect(patternBpm(PRESET_STRUM_PATTERNS[0])).toBe(DEFAULT_STRUM_BPM);
	});
});

describe("transposeBarPitches — the capo", () => {
	// The default voicing the engine falls back to for a bar with no chord.
	const FALLBACK = [48, 52, 55, 60, 64];

	it("returns the table untouched at capo 0, nulls included", () => {
		const pitches = [[48, 52, 55], null];
		expect(transposeBarPitches(pitches, 0, FALLBACK)).toEqual([[48, 52, 55], null]);
	});

	it("raises every resolved pitch by the capo fret", () => {
		expect(transposeBarPitches([[48, 52, 55]], 2, FALLBACK)).toEqual([[50, 54, 57]]);
	});

	it("sounds the transposed default voicing for a bar with no chord", () => {
		expect(transposeBarPitches([null], 3, FALLBACK)).toEqual([[51, 55, 58, 63, 67]]);
	});

	it("handles a mixed table in one pass", () => {
		expect(transposeBarPitches([[40], null, [64]], 1, FALLBACK)).toEqual([
			[41],
			[49, 53, 56, 61, 65],
			[65],
		]);
	});

	it("copies rather than mutating the input", () => {
		const bar = [48, 52];
		const out = transposeBarPitches([bar], 0, FALLBACK);
		out[0]![0] = 99;
		expect(bar[0]).toBe(48);
	});
});

describe("patternMeter", () => {
	const base = { id: "p", name: "n", beats: [] };

	it("reads 4/4 for a pattern stored before meters existed", () => {
		expect(patternMeter(base)).toEqual([4, 4]);
	});

	it("reads the stored meter", () => {
		expect(patternMeter({ ...base, meter: [6, 8] })).toEqual([6, 8]);
		expect(patternMeter({ ...base, meter: [3, 4] })).toEqual([3, 4]);
	});

	it("falls back rather than trusting an unsupported stored value", () => {
		// The column is jsonb; anything could be in it.
		expect(patternMeter({ ...base, meter: [7, 8] as unknown as [number, number] })).toEqual([
			4, 4,
		]);
		expect(patternMeter({ ...base, meter: "6/8" as unknown as [number, number] })).toEqual([
			4, 4,
		]);
	});
});

describe("tempo across meters", () => {
	it("offers a lower ceiling in a compound meter", () => {
		// 220 dotted quarters is 22 eighths a second — not a tempo anyone strums.
		expect(bpmRangeForMeter([4, 4]).max).toBeGreaterThan(bpmRangeForMeter([6, 8]).max);
		expect(bpmRangeForMeter([4, 4])).toEqual(bpmRangeForMeter([3, 4]));
		expect(bpmRangeForMeter([6, 8])).toEqual(bpmRangeForMeter([12, 8]));
	});

	it("clamps a stored tempo into the meter's range", () => {
		expect(clampBpmToMeter(200, [4, 4])).toBe(200);
		expect(clampBpmToMeter(200, [6, 8])).toBe(bpmRangeForMeter([6, 8]).max);
		expect(clampBpmToMeter(10, [6, 8])).toBe(bpmRangeForMeter([6, 8]).min);
	});

	describe("rescaleBpmForMeter", () => {
		it("leaves the number alone within a meter family", () => {
			expect(rescaleBpmForMeter(80, [4, 4], [3, 4])).toBe(80);
			expect(rescaleBpmForMeter(80, [6, 8], [12, 8])).toBe(80);
		});

		it("holds the eighth note still when crossing families", () => {
			// This is the point: 80 in 4/4 puts an eighth every 0.375 s. The same
			// eighth in 6/8 needs a dotted quarter of 1.125 s, which is 53.3 BPM.
			const bpm44 = 80;
			const eighthIn44 = 60 / bpm44 / 2;
			const bpm68 = rescaleBpmForMeter(bpm44, [4, 4], [6, 8]);
			const eighthIn68 = 60 / bpm68 / 3;
			expect(eighthIn68).toBeCloseTo(eighthIn44, 10);
			expect(bpm68).toBeCloseTo(53.33, 2);
		});

		it("round-trips", () => {
			expect(rescaleBpmForMeter(rescaleBpmForMeter(90, [4, 4], [6, 8]), [6, 8], [4, 4])).toBe(90);
		});

		it("scales down going compound and up coming back", () => {
			expect(rescaleBpmForMeter(120, [4, 4], [6, 8])).toBe(80);
			expect(rescaleBpmForMeter(80, [6, 8], [4, 4])).toBe(120);
		});
	});
});
