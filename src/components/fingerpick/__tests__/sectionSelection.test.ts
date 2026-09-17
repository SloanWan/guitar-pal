import { describe, it, expect } from "vitest";
import {
	EMPTY_SELECTION,
	highlightedRange,
	pickMeasure,
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
