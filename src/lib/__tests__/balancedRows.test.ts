import { describe, it, expect } from "vitest";
import { balancedPerRow, balancedRowSizes, evenRowSizes, splitRows } from "@/lib/balancedRows";

describe("evenRowSizes", () => {
	it("splits as evenly as it can, longest rows first", () => {
		expect(evenRowSizes(4, 2)).toEqual([2, 2]);
		expect(evenRowSizes(5, 2)).toEqual([3, 2]);
		expect(evenRowSizes(7, 3)).toEqual([3, 2, 2]);
		expect(evenRowSizes(2, 5)).toEqual([1, 1]);
	});
});

describe("balancedRowSizes", () => {
	it("keeps everything on one row when it fits", () => {
		expect(balancedRowSizes([100, 100, 100, 100], 460, 12)).toEqual([4]);
	});

	it("breaks four sixteenth beats into two and two, never three and one", () => {
		expect(balancedRowSizes([185, 185, 185, 185], 600, 12)).toEqual([2, 2]);
	});

	it("takes more rows only when an even split still does not fit", () => {
		expect(balancedRowSizes([185, 185, 185, 185], 300, 12)).toEqual([1, 1, 1, 1]);
	});

	it("gives an item too wide for any row a row of its own", () => {
		expect(balancedRowSizes([900, 50], 400, 10)).toEqual([1, 1]);
		expect(balancedRowSizes([], 400, 10)).toEqual([]);
	});
});

describe("balancedPerRow", () => {
	it("evens out the last row", () => {
		// Six fit, but seven items would leave one alone: four and three instead.
		expect(balancedPerRow(7, 6 * 96 + 5 * 10, 96, 10)).toBe(4);
		expect(balancedPerRow(4, 1000, 96, 10)).toBe(4);
	});

	it("keeps everything on one row whenever it fits", () => {
		expect(balancedPerRow(5, 5 * 84 + 4 * 10, 84, 10)).toBe(5);
		expect(balancedPerRow(5, 5 * 84 + 4 * 10 - 1, 84, 10)).toBe(3);
	});

	it("respects a cap", () => {
		expect(balancedPerRow(10, 2000, 60, 6, 4)).toBe(4);
		expect(balancedPerRow(5, 2000, 60, 6, 4)).toBe(3);
	});
});

describe("splitRows", () => {
	it("cuts in order", () => {
		expect(splitRows(["a", "b", "c"], [2, 1])).toEqual([["a", "b"], ["c"]]);
	});
});
