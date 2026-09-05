import { describe, it, expect } from "vitest";
import {
	PROGRESSION_PRESETS,
	filterPresets,
	groupPresets,
} from "@/lib/strumProgressionPresets";
import { parseChordSequence } from "@/lib/strumProgressions";
import type { ChordIndexEntry } from "@/lib/chordSearch";

function byId(id: string) {
	const preset = PROGRESSION_PRESETS.find((p) => p.id === id);
	if (!preset) throw new Error(`no preset ${id}`);
	return preset;
}

describe("PROGRESSION_PRESETS", () => {
	it("gives every preset a unique id", () => {
		const ids = PROGRESSION_PRESETS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("writes every chord line as chords a player would type", () => {
		for (const preset of PROGRESSION_PRESETS) {
			expect(preset.chords.trim()).not.toBe("");
			for (const token of preset.chords.split(" ")) {
				// Root, optional accidental, optional quality — no roman numerals,
				// no separators the parser would have to strip.
				expect(token).toMatch(/^[A-G][#b]?[A-Za-z0-9/#+-]*$/);
			}
		}
	});

	it("keeps the long forms the lifted bar cap allows", () => {
		expect(byId("twelve-bar-blues").chords.split(" ")).toHaveLength(12);
		expect(byId("canon").chords.split(" ")).toHaveLength(8);
	});

	it("lists its groups without interleaving them", () => {
		const groups = groupPresets(PROGRESSION_PRESETS).map((g) => g.group);
		expect(new Set(groups).size).toBe(groups.length);
	});
});

describe("filterPresets", () => {
	it("keeps everything for an empty or blank query", () => {
		expect(filterPresets(PROGRESSION_PRESETS, "")).toHaveLength(PROGRESSION_PRESETS.length);
		expect(filterPresets(PROGRESSION_PRESETS, "   ")).toHaveLength(
			PROGRESSION_PRESETS.length,
		);
	});

	it("narrows to the presets that open with the typed chords", () => {
		const ids = filterPresets(PROGRESSION_PRESETS, "C G").map((p) => p.id);
		expect(ids).toContain("four-chords");
		expect(ids).toContain("canon");
		expect(ids).not.toContain("three-chords");
	});

	it("keeps a preset alive while its last chord is half-typed", () => {
		const ids = filterPresets(PROGRESSION_PRESETS, "C G A").map((p) => p.id);
		expect(ids).toContain("four-chords");
	});

	it("matches a run anywhere in the line, not just at the start", () => {
		const ids = filterPresets(PROGRESSION_PRESETS, "Em F").map((p) => p.id);
		expect(ids).toContain("canon");
	});

	it("matches on the name and on the degrees too", () => {
		expect(filterPresets(PROGRESSION_PRESETS, "blues").map((p) => p.id)).toContain(
			"twelve-bar-blues",
		);
		expect(filterPresets(PROGRESSION_PRESETS, "vi–IV–I–V").map((p) => p.id)).toContain(
			"sensitive-female",
		);
	});

	it("drops everything when nothing matches", () => {
		expect(filterPresets(PROGRESSION_PRESETS, "zzz")).toEqual([]);
	});

	it("ignores the separators a typed line may carry", () => {
		expect(filterPresets(PROGRESSION_PRESETS, "C - G").map((p) => p.id)).toContain(
			"four-chords",
		);
	});
});

describe("preset chord lines against the composer's parser", () => {
	// A stand-in library: the parser ranks against this the same way it ranks
	// against the real chord index, so a preset that parses here is written in
	// the notation the composer understands.
	const index: ChordIndexEntry[] = [
		{ root: "C", suffix: "major" },
		{ root: "G", suffix: "major" },
		{ root: "A", suffix: "minor" },
		{ root: "F", suffix: "major" },
	].map((entry) => entry as ChordIndexEntry);

	it("resolves a preset line to one chord per bar", () => {
		const { chords, unmatched } = parseChordSequence(byId("four-chords").chords, index);
		expect(unmatched).toEqual([]);
		expect(chords.map(({ root, suffix }) => ({ root, suffix }))).toEqual([
			{ root: "C", suffix: "major" },
			{ root: "G", suffix: "major" },
			{ root: "A", suffix: "minor" },
			{ root: "F", suffix: "major" },
		]);
	});
});
