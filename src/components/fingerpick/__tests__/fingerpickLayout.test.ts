import { describe, it, expect } from "vitest";
import type { Measure, StringFret } from "@/lib/fingerpickTypes";
import { makeEmptySlot } from "@/lib/fingerpickEdit";
import { CLEF_WIDTH } from "../TabStaveRow";
import {
	computeAllMeasureWidths,
	hoPoConnectorCount,
	layoutMeasureRows,
	ROW_TRAILING_PAD,
} from "../fingerpickLayout";

function note(fret: number, technique: StringFret["technique"] = null): StringFret {
	return { fret, technique, tied: false, muted: false };
}

// Four quarter notes, the low E fretted on each.
function quarterMeasure(id: string): Measure {
	const slots = [0, 1, 2, 3].map((i) => {
		const slot = makeEmptySlot("quarter");
		slot.strings[5] = note(i);
		return slot;
	});
	return { id, slots };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("hoPoConnectorCount", () => {
	it("counts hammer-ons and pull-offs across every string and slot", () => {
		const m = quarterMeasure("m");
		m.slots[1].strings[5] = note(2, "hammer-on");
		m.slots[2].strings[2] = note(0, "pull-off");
		m.slots[2].strings[3] = note(1, "slide-up");
		expect(hoPoConnectorCount(m)).toBe(2);
	});

	it("is zero for a measure without techniques", () => {
		expect(hoPoConnectorCount(quarterMeasure("m"))).toBe(0);
	});
});

describe("computeAllMeasureWidths", () => {
	const measures = [1, 2, 3, 4, 5, 6].map((i) => quarterMeasure(`m${i}`));

	it("puts every measure on one row when the viewer is wide enough, filling it exactly", () => {
		const containerWidth = 4000;
		const rows = computeAllMeasureWidths(measures, containerWidth, 0);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toHaveLength(measures.length);
		expect(sum(rows[0])).toBeCloseTo(containerWidth - CLEF_WIDTH - ROW_TRAILING_PAD, 6);
	});

	it("gives every measure its own row, still filling the width, when only one fits", () => {
		// Narrower than two minimum measures (MIN_MEASURE_WIDTH is 120 each).
		const containerWidth = 200;
		const rows = computeAllMeasureWidths(measures, containerWidth, 0);
		expect(rows).toHaveLength(measures.length);
		for (const row of rows) {
			expect(row).toHaveLength(1);
			expect(row[0]).toBeCloseTo(containerWidth - CLEF_WIDTH - ROW_TRAILING_PAD, 6);
		}
	});

	it("wraps greedily: a row never exceeds the stave space before stretching", () => {
		const containerWidth = 700;
		const rows = computeAllMeasureWidths(measures, containerWidth, 0);
		expect(rows.length).toBeGreaterThan(1);
		expect(sum(rows.map((r) => r.length))).toBe(measures.length);
		for (const row of rows) {
			expect(sum(row)).toBeCloseTo(containerWidth - CLEF_WIDTH - ROW_TRAILING_PAD, 6);
		}
	});

	it("packs fewer measures per row when chord shapes need room", () => {
		const withChord = measures.map((m) => ({
			...m,
			slots: m.slots.map((s, i) =>
				i === 0 ? { ...s, chord: { root: "C", suffix: "major" } } : s,
			),
		}));
		const names = computeAllMeasureWidths(withChord, 700, 0);
		const shapes = computeAllMeasureWidths(withChord, 700, 140);
		expect(shapes.length).toBeGreaterThanOrEqual(names.length);
	});
});

describe("layoutMeasureRows", () => {
	const measures = [1, 2, 3, 4, 5].map((i) => quarterMeasure(`m${i}`));

	it("lays out nothing for an unmeasured viewer", () => {
		expect(layoutMeasureRows(measures, 0, 0)).toEqual([]);
	});

	it("pairs each row's widths with its measures and numbers them from 1", () => {
		const rows = layoutMeasureRows(measures, 700, 0);
		let expectedStart = 1;
		const seen: string[] = [];
		for (const row of rows) {
			expect(row.startMeasureNumber).toBe(expectedStart);
			expect(row.widths).toHaveLength(row.measures.length);
			seen.push(...row.measures.map((m) => m.id));
			expectedStart += row.measures.length;
		}
		expect(seen).toEqual(measures.map((m) => m.id));
	});
});
