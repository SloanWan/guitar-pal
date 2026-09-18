import { describe, it, expect } from "vitest";
import {
	EMPTY_SELECTION,
	highlightedRange,
	pickMeasure,
	sectionBands,
	sectionHint,
} from "../sectionSelection";

describe("pickMeasure", () => {
	it("keeps the first click pending and completes the range on the second", () => {
		const first = pickMeasure(EMPTY_SELECTION, 2);
		expect(first).toEqual({ pending: 2, range: null });
		expect(pickMeasure(first, 5)).toEqual({ pending: null, range: { startMeasure: 2, endMeasure: 5 } });
	});
	it("swaps a second click that comes before the first", () => {
		expect(pickMeasure(pickMeasure(EMPTY_SELECTION, 6), 1)).toEqual({
			pending: null,
			range: { startMeasure: 1, endMeasure: 6 },
		});
	});
	it("makes a one-measure section from the same measure twice", () => {
		expect(pickMeasure(pickMeasure(EMPTY_SELECTION, 3), 3)).toEqual({
			pending: null,
			range: { startMeasure: 3, endMeasure: 3 },
		});
	});
	it("starts over on a third click", () => {
		const done = pickMeasure(pickMeasure(EMPTY_SELECTION, 2), 5);
		expect(pickMeasure(done, 8)).toEqual({ pending: 8, range: null });
	});
});

describe("highlightedRange / sectionHint", () => {
	it("highlights nothing, then the lone pick, then the range", () => {
		expect(highlightedRange(EMPTY_SELECTION)).toBeNull();
		expect(sectionHint(EMPTY_SELECTION)).toBe("Click first measure");
		const first = pickMeasure(EMPTY_SELECTION, 4);
		expect(highlightedRange(first)).toEqual({ startMeasure: 4, endMeasure: 4 });
		expect(sectionHint(first)).toBe("Click last measure");
		const done = pickMeasure(first, 6);
		expect(highlightedRange(done)).toEqual({ startMeasure: 4, endMeasure: 6 });
		expect(sectionHint(done)).toBe("Measures 5–7");
		expect(sectionHint(pickMeasure(first, 4))).toBe("Measure 5");
	});
});

describe("sectionBands", () => {
	// Two rows of two measures, each note area 300 wide with a 20px barline gap.
	const geometry = [
		{ measureIndex: 0, left: 15, width: 300, top: 8, height: 200, rowIndex: 0 },
		{ measureIndex: 1, left: 335, width: 300, top: 8, height: 200, rowIndex: 0 },
		{ measureIndex: 2, left: 15, width: 300, top: 208, height: 200, rowIndex: 1 },
		{ measureIndex: 3, left: 335, width: 300, top: 208, height: 200, rowIndex: 1 },
	];
	it("joins neighbouring measures on a row into one band with no gap", () => {
		expect(sectionBands(geometry, { startMeasure: 0, endMeasure: 1 })).toEqual([
			{ rowIndex: 0, left: 15, width: 620, top: 8, height: 200, startsSection: true, endsSection: true },
		]);
	});
	it("spans rows, opening on the first row and closing on the last", () => {
		expect(sectionBands(geometry, { startMeasure: 1, endMeasure: 2 })).toEqual([
			{ rowIndex: 0, left: 335, width: 300, top: 8, height: 200, startsSection: true, endsSection: false },
			{ rowIndex: 1, left: 15, width: 300, top: 208, height: 200, startsSection: false, endsSection: true },
		]);
	});
	it("is a single measure's own box for a one-measure section", () => {
		expect(sectionBands(geometry, { startMeasure: 3, endMeasure: 3 })).toEqual([
			{ rowIndex: 1, left: 335, width: 300, top: 208, height: 200, startsSection: true, endsSection: true },
		]);
	});
	it("is empty before the staves have drawn", () => {
		expect(sectionBands([], { startMeasure: 0, endMeasure: 1 })).toEqual([]);
	});
});
