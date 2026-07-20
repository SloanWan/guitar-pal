import { describe, it, expect } from "vitest";
import { normalizeImportedPattern } from "../normalizeImportedPattern";
import { MAX_MEASURES } from "../capMeasures";

function makeSf() {
	return { fret: null, technique: null, tied: false, muted: false };
}

function makeStrings() {
	return Array.from({ length: 6 }, makeSf);
}

function makeSlot(id: string) {
	return { id, duration: "quarter", strings: makeStrings() };
}

function makeMeasure(id: string) {
	return { id, slots: [makeSlot(`${id}-s0`)] };
}

function makePattern(measureCount: number) {
	return {
		id: "p1",
		name: "Test",
		bpm: 120,
		timeSignature: [4, 4],
		measures: Array.from({ length: measureCount }, (_, i) => makeMeasure(`m${i}`)),
	};
}

describe("normalizeImportedPattern", () => {
	it("returns pattern:null for gross failures", () => {
		const result = normalizeImportedPattern(null);
		expect(result.pattern).toBeNull();
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.truncated).toBe(false);
	});

	it("returns a valid pattern for valid input", () => {
		const result = normalizeImportedPattern(makePattern(2));
		expect(result.pattern).not.toBeNull();
		expect(result.errors).toHaveLength(0);
		expect(result.truncated).toBe(false);
	});

	it("truncates to MAX_MEASURES after expansion and sets truncated=true", () => {
		// 65 measures, repeat all ×2 → 130 measures → cap to 128
		const raw = makePattern(65);
		const result = normalizeImportedPattern(raw, [{ range: [0, 64], times: 2 }]);
		expect(result.pattern?.measures).toHaveLength(MAX_MEASURES);
		expect(result.truncated).toBe(true);
	});

	it("does not truncate when expansion stays within MAX_MEASURES", () => {
		const raw = makePattern(4);
		const result = normalizeImportedPattern(raw, [{ range: [0, 3], times: 2 }]);
		expect(result.pattern?.measures).toHaveLength(8);
		expect(result.truncated).toBe(false);
	});

	it("emits MEASURES_TRUNCATED warning with original/repairedTo when truncated", () => {
		// 65 measures × 2 = 130 → truncated to MAX_MEASURES (128), dropping 2
		const raw = makePattern(65);
		const result = normalizeImportedPattern(raw, [{ range: [0, 64], times: 2 }]);
		expect(result.truncated).toBe(true);
		const w = result.warnings.find((w) => w.code === "MEASURES_TRUNCATED");
		expect(w).toBeDefined();
		expect(w?.original).toBe(130);
		expect(w?.repairedTo).toBe(MAX_MEASURES);
	});

	it("surfaces validate warnings in the result", () => {
		const raw = { ...makePattern(1), bpm: -5 };
		const result = normalizeImportedPattern(raw);
		expect(result.warnings.some((w) => w.code === "INVALID_BPM")).toBe(true);
	});

	it("surfaces expandRepeats warnings for out-of-bounds repeat", () => {
		const raw = makePattern(2);
		const result = normalizeImportedPattern(raw, [{ range: [0, 99], times: 2 }]);
		expect(result.warnings.some((w) => w.code === "INVALID_REPEAT_DIRECTIVE")).toBe(true);
		expect(result.pattern?.measures).toHaveLength(2); // no expansion
	});

	it("skips expand and cap when validate returns null", () => {
		const result = normalizeImportedPattern({ measures: [] });
		expect(result.pattern).toBeNull();
		expect(result.truncated).toBe(false);
	});
});
