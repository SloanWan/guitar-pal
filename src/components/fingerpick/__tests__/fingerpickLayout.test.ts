import { describe, it, expect } from "vitest";
import type { Measure, StringFret } from "@/lib/fingerpickTypes";
import { makeEmptySlot } from "@/lib/fingerpickEdit";
import { fingerpickToVexFlow } from "@/lib/fingerpickToVexFlow";
import { pitchLabel, soundingMidi } from "@/lib/fingerpickPitch";
import { CLEF_WIDTH, computeMeasureMinWidth, pitchLabelWidth } from "../TabStaveRow";
import {
	computeAllMeasureWidths,
	hoPoConnectorCount,
	layoutMeasureRows,
	measurePitchLabelWidths,
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

	it("packs fewer measures per row when the pitch column is on", () => {
		// Sixteen sixteenths a measure, a label under every one.
		const dense = [1, 2, 3, 4].map((i) => {
			const slots = Array.from({ length: 16 }, (_, k) => {
				const slot = makeEmptySlot("sixteenth");
				slot.strings[0] = note(k);
				return slot;
			});
			return { id: `d${i}`, slots };
		});
		const scientific = (stringIndex: number, fret: number) =>
			pitchLabel(soundingMidi(stringIndex, fret, 0), "scientific");
		const off = computeAllMeasureWidths(dense, 1000, 0);
		const on = computeAllMeasureWidths(dense, 1000, 0, scientific);
		expect(on.length).toBeGreaterThan(off.length);
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

describe("measurePitchLabelWidths", () => {
	const scientific = (stringIndex: number, fret: number) =>
		pitchLabel(soundingMidi(stringIndex, fret, 0), "scientific");

	it("is the widest label under each note, and 0 for a rest", () => {
		const m = quarterMeasure("m");
		// A chord: E4 over G2 — both two characters wide.
		m.slots[0].strings[0] = note(0);
		// F#4: three characters.
		m.slots[1].strings[0] = note(2);
		m.slots[2].isRest = true;
		const { noteSlots } = fingerpickToVexFlow(m);
		expect(measurePitchLabelWidths(m, noteSlots, scientific)).toEqual([
			pitchLabelWidth("G2"),
			pitchLabelWidth("F#4"),
			0,
			pitchLabelWidth("A2"),
		]);
	});

	it("widens the measure only past the room a note already has", () => {
		const m = quarterMeasure("m");
		const { notes, noteSlots } = fingerpickToVexFlow(m);
		const base = computeMeasureMinWidth(notes, true, 0);
		const narrow = computeMeasureMinWidth(notes, true, 0, 0, 0, 0, 0, [1, 1, 1, 1]);
		expect(narrow).toBe(base);
		const wide = computeMeasureMinWidth(
			notes,
			true,
			0,
			0,
			0,
			0,
			0,
			measurePitchLabelWidths(m, noteSlots, scientific).map(() => 40),
		);
		expect(wide).toBeGreaterThan(base);
	});

	it("scales a label's shortfall by the formatter's share-out over every note", () => {
		const m = quarterMeasure("m");
		const { notes } = fingerpickToVexFlow(m);
		const base = computeMeasureMinWidth(notes, true, 0);
		// One labelled note among four: the formatter spreads added width over all
		// four, so the shortfall lands on the labelled one only when scaled by four.
		const one = computeMeasureMinWidth(notes, true, 0, 0, 0, 0, 0, [40, 0, 0, 0]);
		const all = computeMeasureMinWidth(notes, true, 0, 0, 0, 0, 0, [40, 40, 40, 40]);
		expect(one - base).toBeCloseTo(all - base, 6);
		expect(all - base).toBeGreaterThan(0);
	});
});
