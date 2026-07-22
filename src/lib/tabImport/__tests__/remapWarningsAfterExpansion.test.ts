import { describe, it, expect } from "vitest";
import { remapWarningsAfterExpansion } from "../remapWarningsAfterExpansion";
import { normalizeImportedPattern } from "../normalizeImportedPattern";
import type { ValidationIssue } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function warn(path: string, code = "MEASURE_CAPACITY_MISMATCH"): ValidationIssue {
	return { code, path, message: `warning at ${path}` };
}

/**
 * The invariant this task establishes: no returned warning path may reference a
 * measure index >= the number of measures in the final pattern.
 */
function assertNoStaleMeasureIndex(
	warnings: ValidationIssue[],
	measureCount: number,
): void {
	for (const w of warnings) {
		const m = /^measures\[(\d+)\]/.exec(w.path);
		if (m) {
			expect(Number(m[1])).toBeLessThan(measureCount);
		}
	}
}

// ─── remapWarningsAfterExpansion ───────────────────────────────────────────────

describe("remapWarningsAfterExpansion", () => {
	it("is the identity when provenance is a plain 0..n-1 range (no repeats)", () => {
		const sourceIndices = [0, 1, 2];
		const input = [
			warn("measures[0].slots[0].strings[1]"),
			warn("measures[2]"),
			warn("bpm", "INVALID_BPM"),
		];
		const out = remapWarningsAfterExpansion(input, sourceIndices);
		expect(out.map((w) => w.path)).toEqual([
			"measures[0].slots[0].strings[1]",
			"measures[2]",
			"bpm",
		]);
	});

	it("fans out a warning to every post-expansion position of its source measure", () => {
		// Pre-expansion measures [A,B,C]; repeat of measure 1 (B) → B appears at
		// positions 1 and 2.
		const sourceIndices = [0, 1, 1, 2];
		const out = remapWarningsAfterExpansion([warn("measures[1]")], sourceIndices);
		expect(out.map((w) => w.path)).toEqual(["measures[1]", "measures[2]"]);
		expect(out).toHaveLength(2);
	});

	it("fans out a multi-measure repeat range to the correct positions", () => {
		// [A,B,C,D] with [1,2] repeated ×3 → A B C B' C' B'' C'' D
		// provenance:                        0 1 2 1  2  1   2   3
		const sourceIndices = [0, 1, 2, 1, 2, 1, 2, 3];
		const out = remapWarningsAfterExpansion(
			[warn("measures[1]"), warn("measures[2]")],
			sourceIndices,
		);
		// measure 1 (B) → positions 1,3,5 ; measure 2 (C) → positions 2,4,6
		expect(out.map((w) => w.path)).toEqual([
			"measures[1]",
			"measures[3]",
			"measures[5]",
			"measures[2]",
			"measures[4]",
			"measures[6]",
		]);
	});

	it("preserves the slot/string suffix verbatim, rewriting only the leading index", () => {
		const sourceIndices = [0, 1, 1];
		const out = remapWarningsAfterExpansion(
			[warn("measures[1].slots[2].strings[3]")],
			sourceIndices,
		);
		expect(out.map((w) => w.path)).toEqual([
			"measures[1].slots[2].strings[3]",
			"measures[2].slots[2].strings[3]",
		]);
	});

	it("passes non-measure paths through exactly once, unchanged", () => {
		const sourceIndices = [0, 0, 1]; // repeats present, but these paths ignore it
		const out = remapWarningsAfterExpansion(
			[
				warn("", "NOT_AN_OBJECT"),
				warn("measures", "MEASURES_NOT_ARRAY"),
				warn("timeSignature", "INVALID_TIME_SIGNATURE"),
			],
			sourceIndices,
		);
		expect(out.map((w) => w.path)).toEqual(["", "measures", "timeSignature"]);
	});

	it("drops a warning whose source measure was removed by capMeasures", () => {
		// Source index 2 has no post-expansion position → its warning is dropped.
		const sourceIndices = [0, 1, 1];
		const out = remapWarningsAfterExpansion(
			[warn("measures[2].slots[0]"), warn("measures[0]")],
			sourceIndices,
		);
		expect(out.map((w) => w.path)).toEqual(["measures[0]"]);
	});

	it("copies warnings instead of mutating, leaving other fields untouched", () => {
		const original: ValidationIssue = {
			code: "FRET_CLAMPED",
			path: "measures[1].slots[0].strings[0].fret",
			message: "fret 30 out of range [0, 24], clamped to 24",
			original: 30,
			repairedTo: 24,
		};
		const input = [original];
		const out = remapWarningsAfterExpansion(input, [0, 1, 1]);
		// Source unchanged.
		expect(original.path).toBe("measures[1].slots[0].strings[0].fret");
		// Fan-out copies keep code/message/original/repairedTo verbatim.
		for (const w of out) {
			expect(w).not.toBe(original);
			expect(w.code).toBe("FRET_CLAMPED");
			expect(w.message).toBe(original.message);
			expect(w.original).toBe(30);
			expect(w.repairedTo).toBe(24);
		}
		expect(out.map((w) => w.path)).toEqual([
			"measures[1].slots[0].strings[0].fret",
			"measures[2].slots[0].strings[0].fret",
		]);
	});
});

// ─── End-to-end through normalizeImportedPattern ───────────────────────────────

function makeSf() {
	return { fret: null, technique: null, tied: false, muted: false };
}
function makeStrings() {
	return Array.from({ length: 6 }, makeSf);
}
function makeSlot(id: string, duration = "quarter") {
	return { id, duration, strings: makeStrings() };
}
// Four quarter slots fill a 4/4 bar → no capacity warnings unless we force one.
function makeFullMeasure(id: string) {
	return {
		id,
		slots: [
			makeSlot(`${id}-s0`),
			makeSlot(`${id}-s1`),
			makeSlot(`${id}-s2`),
			makeSlot(`${id}-s3`),
		],
	};
}
// A short measure (single quarter) triggers MEASURE_CAPACITY_MISMATCH.
function makeShortMeasure(id: string) {
	return { id, slots: [makeSlot(`${id}-s0`)] };
}

describe("normalizeImportedPattern warning remap (end-to-end)", () => {
	it("returns only warning paths that resolve to a real post-expansion measure", () => {
		// Measures [0 short, 1 full, 2 short]; repeat measures [0,2] ×2.
		// Expansion: 0 1 2 0' 1' 2'  (sources 0 1 2 0 1 2) → 6 measures.
		const raw = {
			id: "p",
			name: "T",
			bpm: 120,
			timeSignature: [4, 4],
			measures: [
				makeShortMeasure("m0"),
				makeFullMeasure("m1"),
				makeShortMeasure("m2"),
			],
		};
		const result = normalizeImportedPattern(raw, [{ range: [0, 2], times: 2 }]);

		expect(result.pattern).not.toBeNull();
		expect(result.pattern?.measures).toHaveLength(6);

		// The short-measure capacity warnings must have fanned out to both copies.
		const capacityPaths = result.warnings
			.filter((w) => w.code === "MEASURE_CAPACITY_MISMATCH")
			.map((w) => w.path);
		// m0 (source 0) → positions 0,3 ; m2 (source 2) → positions 2,5
		expect(capacityPaths).toContain("measures[0]");
		expect(capacityPaths).toContain("measures[3]");
		expect(capacityPaths).toContain("measures[2]");
		expect(capacityPaths).toContain("measures[5]");

		// Invariant: no returned warning path is stale.
		assertNoStaleMeasureIndex(result.warnings, result.pattern?.measures.length ?? 0);
	});

	it("remaps warnings passed via the third (model) parameter identically", () => {
		const raw = {
			id: "p",
			name: "T",
			bpm: 120,
			timeSignature: [4, 4],
			measures: [makeFullMeasure("m0"), makeFullMeasure("m1")],
		};
		// Model warning on pre-expansion measure 1.
		const modelWarnings: ValidationIssue[] = [
			{
				code: "MODEL_LOW_CONFIDENCE",
				path: "measures[1].slots[0].strings[2]",
				message: "unsure",
				original: 5,
			},
		];
		// Repeat measure 1 ×2 → sources 0 1 1 → measure 1 at positions 1,2.
		const result = normalizeImportedPattern(
			raw,
			[{ range: [1, 1], times: 2 }],
			modelWarnings,
		);

		const modelPaths = result.warnings
			.filter((w) => w.code === "MODEL_LOW_CONFIDENCE")
			.map((w) => w.path);
		expect(modelPaths).toEqual([
			"measures[1].slots[0].strings[2]",
			"measures[2].slots[0].strings[2]",
		]);
		assertNoStaleMeasureIndex(result.warnings, result.pattern?.measures.length ?? 0);
	});

	it("keeps the errors/null invariant: remap adds no error condition", () => {
		const raw = {
			id: "p",
			name: "T",
			bpm: 120,
			timeSignature: [4, 4],
			measures: [makeShortMeasure("m0")],
		};
		const result = normalizeImportedPattern(raw, [{ range: [0, 0], times: 3 }]);
		expect(result.errors).toHaveLength(0);
		expect(result.pattern).not.toBeNull();
		assertNoStaleMeasureIndex(result.warnings, result.pattern?.measures.length ?? 0);
	});
});
