import { describe, it, expect } from "vitest";
import type { Measure } from "@/lib/fingerpickTypes";
import { expandRepeats, MAX_REPEAT_TIMES } from "../expandRepeats";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMeasure(label: string): Measure {
	return {
		id: label,
		slots: [{ id: `${label}-s0`, duration: "quarter", strings: [
			{ fret: null, technique: null, tied: false, muted: false },
			{ fret: null, technique: null, tied: false, muted: false },
			{ fret: null, technique: null, tied: false, muted: false },
			{ fret: null, technique: null, tied: false, muted: false },
			{ fret: null, technique: null, tied: false, muted: false },
			{ fret: null, technique: null, tied: false, muted: false },
		] }],
	};
}

const A = makeMeasure("A");
const B = makeMeasure("B");
const C = makeMeasure("C");
const D = makeMeasure("D");
const E = makeMeasure("E");

function allIds(measures: Measure[]): string[] {
	return measures.flatMap((m) => [m.id, ...m.slots.map((s) => s.id)]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("expandRepeats", () => {
	it("returns original measures unchanged when there are no directives", () => {
		const { measures, warnings } = expandRepeats([A, B, C], []);
		expect(measures.map((m) => m.id)).toEqual(["A", "B", "C"]);
		expect(warnings).toHaveLength(0);
	});

	it("repeats a single-measure range × 2 total occurrences", () => {
		// times=2 → range appears twice (1 original + 1 clone)
		const { measures } = expandRepeats([A, B, C], [{ range: [1, 1], times: 2 }]);
		expect(measures).toHaveLength(4);
		// Original B is at index 1; clone follows at index 2
		expect(measures[1].id).toBe("B");
		expect(measures[2].id).not.toBe("B"); // fresh id
	});

	it("repeats a multi-measure range × 3 total occurrences", () => {
		// times=3 → [B,C] appears 3×: original + 2 clones → A B C B' C' B'' C'' D
		const { measures } = expandRepeats([A, B, C, D], [{ range: [1, 2], times: 3 }]);
		expect(measures).toHaveLength(8); // 4 original + 2×2 cloned measures
		expect(measures[0].id).toBe("A");
		expect(measures[1].id).toBe("B");
		expect(measures[2].id).toBe("C");
		// first copy
		expect(measures[3].id).not.toBe("B");
		expect(measures[4].id).not.toBe("C");
		// second copy
		expect(measures[5].id).not.toBe("B");
		expect(measures[6].id).not.toBe("C");
		expect(measures[7].id).toBe("D");
	});

	it("generates unique ids for ALL cloned measures and slots", () => {
		const { measures } = expandRepeats([A, B, C], [{ range: [0, 2], times: 4 }]);
		// 4 total occurrences of 3 measures = 12 measures
		expect(measures).toHaveLength(12);
		const ids = allIds(measures);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it("preserves original measure objects (no mutation)", () => {
		const original = [A, B];
		expandRepeats(original, [{ range: [0, 1], times: 3 }]);
		expect(original[0]).toBe(A);
		expect(original[1]).toBe(B);
	});

	// ─── Out-of-bounds ─────────────────────────────────────────────────────────

	it("skips an out-of-bounds start index and warns", () => {
		const { measures, warnings } = expandRepeats([A, B], [{ range: [-1, 0], times: 2 }]);
		expect(measures).toHaveLength(2); // no expansion
		expect(warnings.some((w) => w.code === "INVALID_REPEAT_DIRECTIVE")).toBe(true);
	});

	it("skips an out-of-bounds end index and warns", () => {
		const { measures, warnings } = expandRepeats([A, B], [{ range: [0, 5], times: 2 }]);
		expect(measures).toHaveLength(2);
		expect(warnings.some((w) => w.code === "INVALID_REPEAT_DIRECTIVE")).toBe(true);
	});

	it("skips a directive where end < start and warns", () => {
		const { measures, warnings } = expandRepeats([A, B, C], [{ range: [2, 1], times: 2 }]);
		expect(measures).toHaveLength(3);
		expect(warnings.some((w) => w.code === "INVALID_REPEAT_DIRECTIVE")).toBe(true);
	});

	it("skips a directive with times < 1 and warns", () => {
		const { measures, warnings } = expandRepeats([A, B], [{ range: [0, 1], times: 0 }]);
		expect(measures).toHaveLength(2);
		expect(warnings.some((w) => w.code === "INVALID_REPEAT_DIRECTIVE")).toBe(true);
	});

	it("skips a directive with times > MAX_REPEAT_TIMES and warns, leaves measures unchanged", () => {
		const { measures, warnings } = expandRepeats([A, B], [{ range: [0, 1], times: MAX_REPEAT_TIMES + 1 }]);
		expect(measures).toHaveLength(2);
		expect(warnings.some((w) => w.code === "INVALID_REPEAT_DIRECTIVE")).toBe(true);
	});

	// ─── Overlapping ───────────────────────────────────────────────────────────

	it("skips an overlapping directive and warns", () => {
		// [0,3] and [2,4] overlap on measures 2-3
		const { measures, warnings } = expandRepeats(
			[A, B, C, D, E],
			[
				{ range: [0, 3], times: 2 },
				{ range: [2, 4], times: 2 },
			],
		);
		// Only the first is accepted; second is skipped
		expect(measures).toHaveLength(9); // 5 + 4 from first repeat
		expect(warnings.some((w) => w.code === "OVERLAPPING_REPEAT_DIRECTIVE")).toBe(true);
	});

	// ─── Multiple non-overlapping directives ───────────────────────────────────

	it("applies multiple non-overlapping directives correctly", () => {
		// [A,B,C,D,E]: repeat [0,0]×2 and [3,4]×2
		const { measures, warnings } = expandRepeats(
			[A, B, C, D, E],
			[
				{ range: [0, 0], times: 2 },
				{ range: [3, 4], times: 2 },
			],
		);
		// A A B C D E D E
		expect(measures).toHaveLength(8);
		expect(measures[0].id).toBe("A");
		expect(measures[1].id).not.toBe("A"); // clone
		expect(measures[2].id).toBe("B");
		expect(measures[3].id).toBe("C");
		expect(measures[4].id).toBe("D");
		expect(measures[5].id).toBe("E");
		// clones
		expect(measures[6].id).not.toBe("D");
		expect(measures[7].id).not.toBe("E");
		expect(warnings).toHaveLength(0);
	});
});
