import { describe, it, expect } from "vitest";

import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import { expandRepeats } from "@/lib/tabImport/expandRepeats";
import {
	deriveRepeatDirectives,
	expandFingerpickPattern,
	mapOriginToExpandedIndex,
	DEFAULT_REPEAT_TIMES,
} from "@/lib/fingerpickRepeats";

// Minimal measure — repeat logic never inspects slots.
function m(id: string, repeat?: Partial<Pick<Measure, "repeatStart" | "repeatEnd" | "repeatTimes">>): Measure {
	return { id, slots: [], ...repeat };
}

function pattern(measures: Measure[]): FingerpickPattern {
	return { id: "p", name: "p", measures, bpm: 120, timeSignature: [4, 4] };
}

describe("deriveRepeatDirectives", () => {
	it("pairs a simple start/end into one directive (default times)", () => {
		const { directives, error } = deriveRepeatDirectives([
			m("A", { repeatStart: true }),
			m("B", { repeatEnd: true }),
			m("C"),
		]);
		expect(error).toBeNull();
		expect(directives).toEqual([{ range: [0, 1], times: DEFAULT_REPEAT_TIMES }]);
	});

	it("treats a measure with both flags as a single-measure repeat", () => {
		const { directives, error } = deriveRepeatDirectives([
			m("A"),
			m("B", { repeatStart: true, repeatEnd: true, repeatTimes: 4 }),
		]);
		expect(error).toBeNull();
		expect(directives).toEqual([{ range: [1, 1], times: 4 }]);
	});

	it("supports back-to-back repeats", () => {
		const { directives, error } = deriveRepeatDirectives([
			m("A", { repeatStart: true }),
			m("B", { repeatEnd: true }),
			m("C", { repeatStart: true }),
			m("D", { repeatEnd: true, repeatTimes: 3 }),
		]);
		expect(error).toBeNull();
		expect(directives).toEqual([
			{ range: [0, 1], times: 2 },
			{ range: [2, 3], times: 3 },
		]);
	});

	it("clamps an out-of-range or invalid times back to the default", () => {
		expect(
			deriveRepeatDirectives([m("A", { repeatStart: true, repeatEnd: true, repeatTimes: 1 })])
				.directives[0].times,
		).toBe(DEFAULT_REPEAT_TIMES);
		expect(
			deriveRepeatDirectives([m("A", { repeatStart: true, repeatEnd: true, repeatTimes: 2.9 })])
				.directives[0].times,
		).toBe(2);
	});

	it("errors on a repeat end with no matching start", () => {
		const { error } = deriveRepeatDirectives([m("A"), m("B", { repeatEnd: true })]);
		expect(error).toMatch(/repeat end without a matching start/);
	});

	it("errors on a repeat start with no matching end", () => {
		const { error } = deriveRepeatDirectives([m("A", { repeatStart: true }), m("B")]);
		expect(error).toMatch(/repeat start without a matching end/);
	});

	it("errors on nested repeats", () => {
		const { error } = deriveRepeatDirectives([
			m("A", { repeatStart: true }),
			m("B", { repeatStart: true }),
			m("C", { repeatEnd: true }),
		]);
		expect(error).toMatch(/nested repeats are not supported/);
	});
});

describe("expandFingerpickPattern", () => {
	it("returns an identity map when there are no repeats", () => {
		const p = pattern([m("A"), m("B"), m("C")]);
		const { pattern: out, originMeasureIndices } = expandFingerpickPattern(p);
		expect(out.measures).toHaveLength(3);
		expect(originMeasureIndices).toEqual([0, 1, 2]);
	});

	it("expands a 2-measure repeat and maps expanded→original", () => {
		const p = pattern([m("A", { repeatStart: true }), m("B", { repeatEnd: true }), m("C")]);
		const { pattern: out, originMeasureIndices } = expandFingerpickPattern(p);
		// A B (A' B') C
		expect(out.measures).toHaveLength(5);
		expect(originMeasureIndices).toEqual([0, 1, 0, 1, 2]);
	});

	it("expands a single-measure repeat with times=3", () => {
		const p = pattern([m("A"), m("B", { repeatStart: true, repeatEnd: true, repeatTimes: 3 })]);
		const { pattern: out, originMeasureIndices } = expandFingerpickPattern(p);
		// A B B' B''
		expect(out.measures).toHaveLength(4);
		expect(originMeasureIndices).toEqual([0, 1, 1, 1]);
	});

	it("returns the pattern unexpanded on invalid markup", () => {
		const p = pattern([m("A", { repeatEnd: true }), m("B")]);
		const { pattern: out, originMeasureIndices } = expandFingerpickPattern(p);
		expect(out.measures).toHaveLength(2);
		expect(originMeasureIndices).toEqual([0, 1]);
	});

	it("keeps the origin map length aligned with expandRepeats output (drift guard)", () => {
		const measures = [
			m("A", { repeatStart: true }),
			m("B", { repeatEnd: true, repeatTimes: 3 }),
			m("C", { repeatStart: true }),
			m("D", { repeatEnd: true }),
			m("E"),
		];
		const { directives } = deriveRepeatDirectives(measures);
		const { measures: expanded } = expandRepeats(measures, directives);
		const { originMeasureIndices } = expandFingerpickPattern(pattern(measures));
		expect(originMeasureIndices).toHaveLength(expanded.length);
		// Every mapped index is a valid original measure index.
		expect(originMeasureIndices.every((i) => i >= 0 && i < measures.length)).toBe(true);
	});
});

describe("mapOriginToExpandedIndex", () => {
	it("maps an original index to its first occurrence", () => {
		const originMap = [0, 1, 0, 1, 2]; // A B A' B' C
		expect(mapOriginToExpandedIndex(originMap, 0)).toBe(0);
		expect(mapOriginToExpandedIndex(originMap, 1)).toBe(1);
		expect(mapOriginToExpandedIndex(originMap, 2)).toBe(4);
	});

	it("falls back to the input index when unmapped", () => {
		expect(mapOriginToExpandedIndex([0, 1, 2], 5)).toBe(5);
	});
});
