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
	followScrollTop,
	FOLLOW_SCROLL_PADDING_PX,
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

describe("followScrollTop", () => {
	// A stack of six 100px rows inside a 300px viewport.
	const ROW = 100;
	const base = { activeHeight: ROW, viewportHeight: 300, contentHeight: 600 };

	it("centres the playing row when the next one already fits below it", () => {
		// Centring bar 3 leaves the window at [100, 400]; the next row ends at
		// 380, comfortably inside it, so centring stands.
		const top = followScrollTop({ ...base, activeTop: 200, nextBottom: 380 });
		expect(top).toBe(100); // 200 + 50 - 150
	});

	it("scrolls further so the next row stays on screen", () => {
		// Centring bar 4 (top 400) would put the next row's bottom at 600, 50px
		// past the viewport; the target moves down to reveal it.
		const centred = 400 + ROW / 2 - 300 / 2;
		const top = followScrollTop({
			...base,
			activeTop: 400,
			nextBottom: 600,
			contentHeight: 1200,
		});
		expect(top).toBeGreaterThan(centred);
		expect(top).toBe(600 + FOLLOW_SCROLL_PADDING_PX - 300);
	});

	it("never pushes the playing row past the top edge", () => {
		// A next row taller than the viewport cannot fit alongside the active one.
		const top = followScrollTop({ ...base, activeTop: 100, nextBottom: 900, contentHeight: 1200 });
		expect(top).toBe(100 - FOLLOW_SCROLL_PADDING_PX);
	});

	it("centres the last bar, which has no following row", () => {
		expect(followScrollTop({ ...base, activeTop: 300, nextBottom: null })).toBe(200);
	});

	it("stays inside the container's scroll range", () => {
		expect(followScrollTop({ ...base, activeTop: 0, nextBottom: 200 })).toBe(0);
		expect(followScrollTop({ ...base, activeTop: 500, nextBottom: null })).toBe(300);
		// Content shorter than the viewport never scrolls.
		expect(
			followScrollTop({ ...base, activeTop: 0, nextBottom: 200, contentHeight: 250 }),
		).toBe(0);
	});
});
