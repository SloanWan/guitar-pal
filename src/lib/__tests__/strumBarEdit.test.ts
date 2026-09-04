import { describe, it, expect } from "vitest";
import {
	cycleStep,
	emptyBar,
	addBar,
	removeBar,
	setBarChord,
	cycleCell,
	addCell,
	removeCell,
	barLocalBeatIndex,
	MAX_BARS,
	MIN_CELLS_PER_BEAT,
} from "@/lib/strumBarEdit";
import { MAX_CELLS_PER_BEAT } from "@/lib/strumBars";
import type { Bar, ChordRef } from "@/lib/strumPatterns";

const C_REF: ChordRef = { root: "C", suffix: "major" };

function bars(count: number): Bar[] {
	return Array.from({ length: count }, () => emptyBar());
}

describe("cycleStep", () => {
	it("cycles rest → down → up → muted → rest", () => {
		expect(cycleStep("")).toBe("D");
		expect(cycleStep("D")).toBe("U");
		expect(cycleStep("U")).toBe("X");
		expect(cycleStep("X")).toBe("");
	});

	it("resets non-editable preset values (ghosts, triplets) to a rest", () => {
		expect(cycleStep("DG")).toBe("");
		expect(cycleStep("UG")).toBe("");
		expect(cycleStep("D3")).toBe("");
		expect(cycleStep("U3")).toBe("");
	});
});

describe("emptyBar", () => {
	it("is a 4-beat, 2-cell, chordless bar", () => {
		const bar = emptyBar();
		expect(bar.chord).toBeNull();
		expect(bar.beats).toHaveLength(4);
		expect(bar.beats.every((b) => b.length === MIN_CELLS_PER_BEAT)).toBe(true);
	});

	it("allocates fresh beats each call — editing one bar cannot bleed into another", () => {
		const a = emptyBar();
		const b = emptyBar();
		expect(a.beats[0]).not.toBe(b.beats[0]);
	});
});

describe("addBar / removeBar", () => {
	it("appends an empty bar", () => {
		const next = addBar(bars(1));
		expect(next).toHaveLength(2);
		expect(next[1].chord).toBeNull();
	});

	it("does not mutate the input", () => {
		const before = bars(1);
		addBar(before);
		expect(before).toHaveLength(1);
	});

	it("refuses to exceed the bar cap", () => {
		const full = bars(MAX_BARS);
		expect(addBar(full)).toBe(full);
	});

	it("removes the addressed bar", () => {
		const three = [
			{ ...emptyBar(), chord: C_REF },
			emptyBar(),
			{ ...emptyBar(), chord: { root: "G", suffix: "major" } },
		];
		const next = removeBar(three, 1);
		expect(next).toHaveLength(2);
		expect(next[1].chord).toEqual({ root: "G", suffix: "major" });
	});

	it("keeps the last bar — a pattern is never bar-less", () => {
		const one = bars(1);
		expect(removeBar(one, 0)).toBe(one);
	});

	it("ignores an out-of-range index", () => {
		const two = bars(2);
		expect(removeBar(two, 5)).toBe(two);
		expect(removeBar(two, -1)).toBe(two);
	});
});

describe("setBarChord", () => {
	it("assigns a chord to one bar only", () => {
		const next = setBarChord(bars(3), 1, C_REF);
		expect(next[0].chord).toBeNull();
		expect(next[1].chord).toEqual(C_REF);
		expect(next[2].chord).toBeNull();
	});

	it("clears a chord back to null", () => {
		const withChord = setBarChord(bars(1), 0, C_REF);
		expect(setBarChord(withChord, 0, null)[0].chord).toBeNull();
	});

	it("leaves the beats untouched", () => {
		const before = bars(1);
		const next = setBarChord(before, 0, C_REF);
		expect(next[0].beats).toBe(before[0].beats);
	});
});

describe("cycleCell", () => {
	it("advances only the addressed cell", () => {
		const next = cycleCell(bars(2), 1, 2, 0);
		expect(next[1].beats[2]).toEqual(["D", ""]);
		expect(next[1].beats[1]).toEqual(["", ""]);
		expect(next[0].beats[2]).toEqual(["", ""]);
	});

	it("does not mutate the input", () => {
		const before = bars(1);
		cycleCell(before, 0, 0, 0);
		expect(before[0].beats[0]).toEqual(["", ""]);
	});
});

describe("addCell / removeCell", () => {
	it("grows a beat up to the cell cap", () => {
		let next = addCell(bars(1), 0, 0);
		expect(next[0].beats[0]).toHaveLength(3);
		next = addCell(next, 0, 0);
		expect(next[0].beats[0]).toHaveLength(MAX_CELLS_PER_BEAT);
		next = addCell(next, 0, 0);
		expect(next[0].beats[0]).toHaveLength(MAX_CELLS_PER_BEAT);
	});

	it("shrinks a beat down to the cell floor", () => {
		const grown = addCell(bars(1), 0, 0);
		let next = removeCell(grown, 0, 0);
		expect(next[0].beats[0]).toHaveLength(MIN_CELLS_PER_BEAT);
		next = removeCell(next, 0, 0);
		expect(next[0].beats[0]).toHaveLength(MIN_CELLS_PER_BEAT);
	});

	it("drops the last cell, keeping the earlier steps", () => {
		const withSteps = cycleCell(addCell(bars(1), 0, 0), 0, 0, 0);
		expect(removeCell(withSteps, 0, 0)[0].beats[0]).toEqual(["D", ""]);
	});

	it("touches only the addressed beat of the addressed bar", () => {
		const next = addCell(bars(2), 1, 3);
		expect(next[1].beats[3]).toHaveLength(3);
		expect(next[1].beats[0]).toHaveLength(2);
		expect(next[0].beats[3]).toHaveLength(2);
	});
});

describe("barLocalBeatIndex — flat scheduler cursor to grid position", () => {
	const twoBars = bars(2); // 4 + 4 beats

	it("passes through inside the first bar", () => {
		expect(barLocalBeatIndex(twoBars, 0)).toBe(0);
		expect(barLocalBeatIndex(twoBars, 3)).toBe(3);
	});

	it("restarts at 0 on the next bar line", () => {
		expect(barLocalBeatIndex(twoBars, 4)).toBe(0);
		expect(barLocalBeatIndex(twoBars, 7)).toBe(3);
	});

	it("handles bars of unequal length", () => {
		const uneven: Bar[] = [
			{ beats: [["D"], ["D"], ["D"]], chord: null },
			{ beats: [["D"], ["D"]], chord: null },
		];
		expect(barLocalBeatIndex(uneven, 2)).toBe(2);
		expect(barLocalBeatIndex(uneven, 3)).toBe(0);
		expect(barLocalBeatIndex(uneven, 4)).toBe(1);
	});

	it("clamps a stale cursor past the end rather than pointing at nothing", () => {
		expect(barLocalBeatIndex(twoBars, 99)).toBe(0);
		expect(barLocalBeatIndex(twoBars, -1)).toBe(0);
	});
});
