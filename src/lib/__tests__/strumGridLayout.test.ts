import { describe, it, expect } from "vitest";
import {
	paddedBeatLength,
	paddedBeatCells,
	paddedCellIndex,
	barDisplayCells,
	maxBarDisplayCells,
	barsFitTwoColumns,
	MAX_BAR_DISPLAY_CELLS,
	TWO_COLUMN_MAX_CELLS,
} from "@/lib/strumGridLayout";
import type { Bar, Beat } from "@/lib/strumPatterns";

function bar(beats: Beat[]): Bar {
	return { beats, chord: null };
}

const QUARTERS: Beat[] = [
	["D", "UG"],
	["D", "UG"],
	["D", "UG"],
	["D", "UG"],
];
/** A two-beat bar: half the columns of a four-beat one. */
const SHORT: Beat[] = [
	["D", "UG"],
	["D", "U"],
];
const SIXTEENTHS: Beat[] = [
	["D", "U", "D", "U"],
	["D", "U", "D", "U"],
	["D", "U", "D", "U"],
	["D", "U", "D", "U"],
];

describe("beat padding", () => {
	it("pads one- and two-cell beats out to four columns", () => {
		expect(paddedBeatLength(1)).toBe(4);
		expect(paddedBeatLength(2)).toBe(4);
		expect(paddedBeatCells(["D"])).toEqual(["D", "G", "UG", "G"]);
		expect(paddedBeatCells(["D", "U"])).toEqual(["D", "G", "U", "G"]);
	});

	it("leaves triplets and sixteenths alone", () => {
		expect(paddedBeatLength(3)).toBe(3);
		expect(paddedBeatLength(4)).toBe(4);
		expect(paddedBeatCells(["D3", "U3", "D3"])).toEqual(["D3", "U3", "D3"]);
	});

	it("maps an engine cell index onto its display column", () => {
		// A two-cell beat renders on columns 0 and 2 of the padded four.
		expect(paddedCellIndex(2, 0)).toBe(0);
		expect(paddedCellIndex(2, 1)).toBe(2);
		expect(paddedCellIndex(4, 3)).toBe(3);
	});
});

describe("bar width", () => {
	it("counts a bar in padded display columns", () => {
		// Two-cell beats pad out to four, so a quarter-note bar is as wide as a
		// sixteenth one — the padding is what keeps beats aligned.
		expect(barDisplayCells(bar(QUARTERS))).toBe(16);
		expect(barDisplayCells(bar(SIXTEENTHS))).toBe(16);
	});

	it("counts triplet beats as three columns", () => {
		expect(barDisplayCells(bar([["D3", "U3", "D3"], ["D", "UG"]]))).toBe(7);
	});

	it("reports the widest bar of a set", () => {
		expect(maxBarDisplayCells([bar(SHORT), bar(SIXTEENTHS)])).toBe(16);
	});
});

describe("column layout", () => {
	it("puts short bars two per row", () => {
		expect(barsFitTwoColumns([bar(SHORT), bar(SHORT)])).toBe(true);
	});

	it("drops to one per row as soon as any bar is too wide", () => {
		expect(barsFitTwoColumns([bar(SHORT), bar(QUARTERS)])).toBe(false);
		expect(barsFitTwoColumns([bar(SIXTEENTHS), bar(SIXTEENTHS)])).toBe(false);
	});

	it("never uses two columns for a single bar", () => {
		expect(barsFitTwoColumns([bar(SHORT)])).toBe(false);
	});

	it("keeps the thresholds consistent with a four-beat bar", () => {
		expect(maxBarDisplayCells([bar(SIXTEENTHS)])).toBe(MAX_BAR_DISPLAY_CELLS);
		expect(TWO_COLUMN_MAX_CELLS * 2).toBe(MAX_BAR_DISPLAY_CELLS);
	});
});
