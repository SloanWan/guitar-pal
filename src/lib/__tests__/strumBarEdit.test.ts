import { describe, it, expect } from "vitest";
import {
	cycleStep,
	emptyBar,
	addBar,
	removeBar,
	setBarChord,
	duplicateBar,
	swapBars,
	cycleCell,
	addCell,
	removeCell,
	barLocalBeatIndex,
	MIN_CELLS_PER_BEAT,
	resizeBeat,
} from "@/lib/strumBarEdit";
import { MAX_CELLS_PER_BEAT } from "@/lib/strumBars";
import type { Bar, ChordRef , Beat } from "@/lib/strumPatterns";

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

	it("keeps appending past what used to be the bar cap", () => {
		const long = bars(8);
		expect(addBar(long)).toHaveLength(9);
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

describe("duplicateBar", () => {
	it("appends the copy at the end, not beside its source", () => {
		const three = [
			setBarChord(bars(1), 0, C_REF)[0],
			emptyBar(),
			emptyBar(),
		];
		const next = duplicateBar(three, 0);
		expect(next).toHaveLength(4);
		expect(next[3].chord).toEqual(C_REF);
		// the bars the user is reading keep their numbers
		expect(next.slice(0, 3)).toEqual(three);
	});

	it("copies the chord along with the beats", () => {
		const withChord = setBarChord(bars(1), 0, { root: "G", suffix: "minor" });
		expect(duplicateBar(withChord, 0)[1].chord).toEqual({ root: "G", suffix: "minor" });
	});

	it("deep-copies the beats so editing the clone leaves the source alone", () => {
		const source = cycleCell(bars(1), 0, 0, 0);
		const copied = duplicateBar(source, 0);
		const edited = cycleCell(copied, 1, 0, 0);
		expect(edited[0].beats[0]).toEqual(["D", ""]);
		expect(edited[1].beats[0]).toEqual(["U", ""]);
		expect(copied[1].beats[0]).not.toBe(copied[0].beats[0]);
	});

	it("duplicates past what used to be the bar cap", () => {
		const long = bars(8);
		expect(duplicateBar(long, 0)).toHaveLength(9);
	});

	it("ignores an out-of-range index", () => {
		const two = bars(2);
		expect(duplicateBar(two, 9)).toBe(two);
	});
});

describe("swapBars", () => {
	it("swaps two bars", () => {
		const three = setBarChord(bars(3), 0, C_REF);
		const next = swapBars(three, 0, 1);
		expect(next[0].chord).toBeNull();
		expect(next[1].chord).toEqual(C_REF);
	});

	it("does not mutate the input", () => {
		const before = setBarChord(bars(2), 0, C_REF);
		swapBars(before, 0, 1);
		expect(before[0].chord).toEqual(C_REF);
	});

	it("is a no-op for identical or out-of-range indices", () => {
		const two = bars(2);
		expect(swapBars(two, 1, 1)).toBe(two);
		expect(swapBars(two, 0, -1)).toBe(two);
		expect(swapBars(two, 0, 5)).toBe(two);
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
	it("grows a beat up to the cap its meter allows", () => {
		// MAX_CELLS_PER_BEAT is the storage capacity (six, for a dotted beat in
		// sixteenths), not the editor's ceiling. In 4/4 the ceiling is four —
		// a quarter beat has no five- or six-way division worth offering.
		const SIMPLE_MAX = 4;
		let next = addCell(bars(1), 0, 0);
		expect(next[0].beats[0]).toHaveLength(3);
		next = addCell(next, 0, 0);
		expect(next[0].beats[0]).toHaveLength(SIMPLE_MAX);
		next = addCell(next, 0, 0);
		expect(next[0].beats[0]).toHaveLength(SIMPLE_MAX);
		expect(SIMPLE_MAX).toBeLessThan(MAX_CELLS_PER_BEAT);
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

describe("emptyBar with a meter", () => {
	it("still builds a 4/4 bar when no meter is given", () => {
		const bar = emptyBar();
		expect(bar.beats).toHaveLength(4);
		expect(bar.beats.every((b) => b.length === 2)).toBe(true);
	});

	it("builds 6/8 as two dotted beats of three cells, not six beats of one", () => {
		const bar = emptyBar([6, 8]);
		expect(bar.beats).toHaveLength(2);
		expect(bar.beats.every((b) => b.length === 3)).toBe(true);
	});

	it("builds 12/8 as four dotted beats", () => {
		const bar = emptyBar([12, 8]);
		expect(bar.beats).toHaveLength(4);
		expect(bar.beats.every((b) => b.length === 3)).toBe(true);
	});

	it("builds 3/4 as three simple beats", () => {
		const bar = emptyBar([3, 4]);
		expect(bar.beats).toHaveLength(3);
		expect(bar.beats.every((b) => b.length === 2)).toBe(true);
	});

	it("never shares cell arrays between beats", () => {
		const bar = emptyBar([6, 8]);
		expect(bar.beats[0]).not.toBe(bar.beats[1]);
	});

	it("gives an added bar the same meter as the rest", () => {
		const bars = addBar([emptyBar([6, 8])], [6, 8]);
		expect(bars).toHaveLength(2);
		expect(bars[1].beats).toHaveLength(2);
		expect(bars[1].beats[0]).toHaveLength(3);
	});
});

describe("resizeBeat", () => {
	it("spreads strokes across their own positions when doubling", () => {
		// The whole point: three eighths becoming six sixteenths must leave each
		// eighth where it was in time. Appending blanks would shove all three into
		// the first half of the beat and silently rewrite the rhythm.
		expect(resizeBeat(["D", "U", "D"], 6)).toEqual(["D", "", "U", "", "D", ""]);
	});

	it("keeps the on-beat cells when halving", () => {
		expect(resizeBeat(["D", "U", "D", "U", "X", "U"], 3)).toEqual(["D", "D", "X"]);
	});

	it("round-trips a rhythm that has nothing on the off-beats", () => {
		const eighths: Beat = ["D", "U", "D"];
		expect(resizeBeat(resizeBeat(eighths, 6), 3)).toEqual(eighths);
	});

	it("drops what sat between the kept cells, and says so by losing it", () => {
		// Halving cannot preserve an off-beat stroke; the alternative would be
		// refusing the edit, which is worse.
		expect(resizeBeat(["D", "U", "", "", "", ""], 3)).toEqual(["D", "", ""]);
	});

	it("pads or trims from the end when neither count divides the other", () => {
		expect(resizeBeat(["D", "U"], 3)).toEqual(["D", "U", ""]);
		expect(resizeBeat(["D", "U", "D"], 4)).toEqual(["D", "U", "D", ""]);
		expect(resizeBeat(["D", "U", "D", "U"], 3)).toEqual(["D", "U", "D"]);
	});

	it("leaves a beat alone when nothing changes", () => {
		const beat: Beat = ["D", "U"];
		expect(resizeBeat(beat, 2)).toBe(beat);
		expect(resizeBeat(beat, 0)).toBe(beat);
	});
});

describe("cell stepping follows the meter", () => {
	function beatOf(bars: Bar[]): Beat {
		return bars[0].beats[0];
	}

	it("steps a compound beat straight from three to six and back", () => {
		let bars = [emptyBar([6, 8])];
		bars = cycleCell(bars, 0, 0, 0);
		expect(beatOf(bars)).toHaveLength(3);

		bars = addCell(bars, 0, 0, [6, 8]);
		expect(beatOf(bars)).toHaveLength(6);
		expect(beatOf(bars)[0]).toBe("D");

		bars = removeCell(bars, 0, 0, [6, 8]);
		expect(beatOf(bars)).toEqual(["D", "", ""]);
	});

	it("refuses to leave a dotted beat on a count that names no note value", () => {
		let bars = [emptyBar([6, 8])];
		// Six is the finest; another press must not produce seven.
		bars = addCell(bars, 0, 0, [6, 8]);
		bars = addCell(bars, 0, 0, [6, 8]);
		expect(beatOf(bars)).toHaveLength(6);
		// Three is the coarsest; another press must not produce two.
		bars = removeCell(bars, 0, 0, [6, 8]);
		bars = removeCell(bars, 0, 0, [6, 8]);
		expect(beatOf(bars)).toHaveLength(3);
	});

	it("leaves simple-meter stepping exactly as it was", () => {
		// 4/4 walks 2-3-4 one at a time, and each step keeps the leading cells —
		// the behaviour before meters existed. Guarded so the compound rules
		// cannot quietly change how every existing pattern is edited.
		let bars = [emptyBar()];
		bars = cycleCell(bars, 0, 0, 0);
		expect(beatOf(bars)).toEqual(["D", ""]);

		bars = addCell(bars, 0, 0);
		expect(beatOf(bars)).toEqual(["D", "", ""]);
		bars = addCell(bars, 0, 0);
		expect(beatOf(bars)).toEqual(["D", "", "", ""]);
		bars = addCell(bars, 0, 0);
		expect(beatOf(bars)).toHaveLength(4);

		bars = removeCell(bars, 0, 0);
		expect(beatOf(bars)).toEqual(["D", "", ""]);
		bars = removeCell(bars, 0, 0);
		expect(beatOf(bars)).toEqual(["D", ""]);
		bars = removeCell(bars, 0, 0);
		expect(beatOf(bars)).toHaveLength(2);
	});
});
