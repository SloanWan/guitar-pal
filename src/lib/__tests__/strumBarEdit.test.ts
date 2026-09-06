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
	copyBeat,
	resizeBeat,
	setBarCells,
	swapBeats,
	setCell,
	stepCellPosition,
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

describe("cycleStep leads with the stroke that belongs at the position", () => {
	it("still leads with a downstroke by default", () => {
		expect(cycleStep("")).toBe("D");
	});

	it("leads with an upstroke where the hand is travelling up", () => {
		expect(cycleStep("", "U")).toBe("U");
		expect(cycleStep("U", "U")).toBe("D");
		expect(cycleStep("D", "U")).toBe("X");
		expect(cycleStep("X", "U")).toBe("");
	});

	it("keeps the against-the-motion stroke reachable, just second", () => {
		// The shipped "muted" preset opens a beat with an upstroke, so writing a
		// stroke against the alternation has to stay possible.
		expect(cycleStep(cycleStep("", "U"), "U")).toBe("D");
		expect(cycleStep(cycleStep("", "D"), "D")).toBe("U");
	});

	it("still resets a preset-only value to a rest whichever way it leads", () => {
		for (const preset of ["DG", "UG", "D3", "U3"] as const) {
			expect(cycleStep(preset, "D")).toBe("");
			expect(cycleStep(preset, "U")).toBe("");
		}
	});
});

describe("cycleCell reads the position from the cell index", () => {
	it("writes a downstroke on an even cell and an upstroke on an odd one", () => {
		const start = [emptyBar()];
		expect(cycleCell(start, 0, 0, 0)[0].beats[0][0]).toBe("D");
		expect(cycleCell(start, 0, 0, 1)[0].beats[0][1]).toBe("U");
	});

	it("halves the clicks for a plain alternating bar", () => {
		// Every stroke of DUDU is now one press; the odd cells used to take two.
		let bars = [emptyBar()];
		for (let beatIdx = 0; beatIdx < 4; beatIdx++) {
			bars = cycleCell(bars, 0, beatIdx, 0);
			bars = cycleCell(bars, 0, beatIdx, 1);
		}
		expect(bars[0].beats).toEqual([
			["D", "U"],
			["D", "U"],
			["D", "U"],
			["D", "U"],
		]);
	});

	it("alternates across a four-cell beat", () => {
		let bars = [emptyBar()];
		bars = addCell(bars, 0, 0);
		bars = addCell(bars, 0, 0);
		for (let cellIdx = 0; cellIdx < 4; cellIdx++) bars = cycleCell(bars, 0, 0, cellIdx);
		expect(bars[0].beats[0]).toEqual(["D", "U", "D", "U"]);
	});
});

describe("setBarCells", () => {
	it("re-divides every beat in one action", () => {
		const bars = setBarCells([emptyBar()], 0, 4);
		expect(bars[0].beats).toHaveLength(4);
		expect(bars[0].beats.every((b) => b.length === 4)).toBe(true);
	});

	it("keeps written strokes at the point in time they were written", () => {
		let bars = [emptyBar()];
		bars = cycleCell(bars, 0, 0, 0);
		bars = cycleCell(bars, 0, 1, 0);
		bars = setBarCells(bars, 0, 4);
		// Each beat's downbeat stroke stays on its own downbeat.
		expect(bars[0].beats[0]).toEqual(["D", "", "", ""]);
		expect(bars[0].beats[1]).toEqual(["D", "", "", ""]);
	});

	it("leaves other bars alone", () => {
		const bars = setBarCells([emptyBar(), emptyBar()], 1, 4);
		expect(bars[0].beats[0]).toHaveLength(2);
		expect(bars[1].beats[0]).toHaveLength(4);
	});

	it("ignores an out-of-range bar rather than throwing", () => {
		const bars = [emptyBar()];
		expect(setBarCells(bars, 5, 4)).toBe(bars);
		expect(setBarCells(bars, -1, 4)).toBe(bars);
	});
});

describe("stepCellPosition", () => {
	const twoBars = [emptyBar(), emptyBar()];

	it("moves along a beat", () => {
		expect(stepCellPosition(twoBars, { barIdx: 0, beatIdx: 0, cellIdx: 0 }, 1)).toEqual({
			barIdx: 0,
			beatIdx: 0,
			cellIdx: 1,
		});
	});

	it("crosses a beat boundary, which is a drawing convention and not a wall", () => {
		expect(stepCellPosition(twoBars, { barIdx: 0, beatIdx: 0, cellIdx: 1 }, 1)).toEqual({
			barIdx: 0,
			beatIdx: 1,
			cellIdx: 0,
		});
	});

	it("crosses a bar boundary too", () => {
		expect(stepCellPosition(twoBars, { barIdx: 0, beatIdx: 3, cellIdx: 1 }, 1)).toEqual({
			barIdx: 1,
			beatIdx: 0,
			cellIdx: 0,
		});
	});

	it("walks backwards the same way", () => {
		expect(stepCellPosition(twoBars, { barIdx: 1, beatIdx: 0, cellIdx: 0 }, -1)).toEqual({
			barIdx: 0,
			beatIdx: 3,
			cellIdx: 1,
		});
	});

	it("stops at either end instead of wrapping", () => {
		expect(stepCellPosition(twoBars, { barIdx: 0, beatIdx: 0, cellIdx: 0 }, -1)).toBeNull();
		expect(stepCellPosition(twoBars, { barIdx: 1, beatIdx: 3, cellIdx: 1 }, 1)).toBeNull();
	});

	it("returns null for a position that is not in the grid", () => {
		expect(stepCellPosition(twoBars, { barIdx: 9, beatIdx: 0, cellIdx: 0 }, 1)).toBeNull();
		expect(stepCellPosition(twoBars, { barIdx: 0, beatIdx: 0, cellIdx: 7 }, 1)).toBeNull();
	});

	it("handles beats of differing widths", () => {
		const mixed = setBarCells([emptyBar()], 0, 2);
		const wide = addCell(addCell(mixed, 0, 1), 0, 1);
		expect(wide[0].beats[1]).toHaveLength(4);
		expect(stepCellPosition(wide, { barIdx: 0, beatIdx: 1, cellIdx: 3 }, 1)).toEqual({
			barIdx: 0,
			beatIdx: 2,
			cellIdx: 0,
		});
	});
});

describe("copyBeat", () => {
	function written(): Bar[] {
		// Beat 0 becomes "D U", the rest stay empty.
		let bars = [emptyBar()];
		bars = cycleCell(bars, 0, 0, 0);
		bars = cycleCell(bars, 0, 0, 1);
		return bars;
	}

	it("copies a beat onto the next one", () => {
		const bars = copyBeat(written(), 0, 0, 1);
		expect(bars[0].beats[1]).toEqual(["D", "U"]);
		expect(bars[0].beats[0]).toEqual(["D", "U"]);
	});

	it("leaves the beats it was not asked about alone", () => {
		const bars = copyBeat(written(), 0, 0, 1);
		expect(bars[0].beats[2]).toEqual(["", ""]);
		expect(bars[0].beats[3]).toEqual(["", ""]);
	});

	it("does not let the two beats share cells", () => {
		let bars = copyBeat(written(), 0, 0, 1);
		expect(bars[0].beats[0]).not.toBe(bars[0].beats[1]);
		// Editing the copy must not reach back into the original.
		bars = setCell(bars, 0, 1, 0, "X");
		expect(bars[0].beats[0][0]).toBe("D");
	});

	it("carries the source's subdivision with it", () => {
		let bars = [emptyBar()];
		bars = addCell(bars, 0, 0);
		bars = addCell(bars, 0, 0);
		expect(bars[0].beats[0]).toHaveLength(4);
		bars = copyBeat(bars, 0, 0, 1);
		expect(bars[0].beats[1]).toHaveLength(4);
		// The bar is not otherwise re-divided.
		expect(bars[0].beats[2]).toHaveLength(2);
	});

	it("stays legal in a compound meter, where widths are a set", () => {
		let bars = [emptyBar([6, 8])];
		bars = addCell(bars, 0, 0, [6, 8]);
		expect(bars[0].beats[0]).toHaveLength(6);
		bars = copyBeat(bars, 0, 0, 1);
		expect(bars[0].beats.map((b) => b.length)).toEqual([6, 6]);
	});

	it("fills a bar when walked rightwards", () => {
		let bars = written();
		for (let i = 0; i < 3; i++) bars = copyBeat(bars, 0, i, i + 1);
		expect(bars[0].beats).toEqual([
			["D", "U"],
			["D", "U"],
			["D", "U"],
			["D", "U"],
		]);
	});

	it("copies within the addressed bar only", () => {
		const two = [written()[0], emptyBar()];
		const bars = copyBeat(two, 1, 0, 1);
		expect(bars[1].beats[1]).toEqual(["", ""]);
		expect(bars[0].beats[0]).toEqual(["D", "U"]);
	});

	it("is a no-op for a source and target that are the same, or out of range", () => {
		const bars = written();
		expect(copyBeat(bars, 0, 1, 1)).toBe(bars);
		expect(copyBeat(bars, 0, 0, 9)).toBe(bars);
		expect(copyBeat(bars, 0, -1, 1)).toBe(bars);
		expect(copyBeat(bars, 5, 0, 1)).toBe(bars);
	});
});

describe("swapBeats", () => {
	function bar4(): Bar[] {
		let bars = [emptyBar()];
		bars = cycleCell(bars, 0, 0, 0); // beat 0 gets a D
		bars = cycleCell(bars, 0, 3, 1); // beat 3 gets a U on its off-beat
		return bars;
	}

	it("exchanges two beats", () => {
		const bars = swapBeats(bar4(), 0, 0, 3);
		expect(bars[0].beats[0]).toEqual(["", "U"]);
		expect(bars[0].beats[3]).toEqual(["D", ""]);
	});

	it("keeps the bar's beat count, since that belongs to the meter", () => {
		expect(swapBeats(bar4(), 0, 0, 1)[0].beats).toHaveLength(4);
	});

	it("carries differing widths with their beats", () => {
		let bars = addCell(addCell([emptyBar()], 0, 0), 0, 0);
		expect(bars[0].beats.map((b) => b.length)).toEqual([4, 2, 2, 2]);
		bars = swapBeats(bars, 0, 0, 2);
		expect(bars[0].beats.map((b) => b.length)).toEqual([2, 2, 4, 2]);
	});

	it("is its own inverse", () => {
		const bars = bar4();
		expect(swapBeats(swapBeats(bars, 0, 1, 2), 0, 1, 2)).toEqual(bars);
	});

	it("is a no-op for equal or out-of-range indices", () => {
		const bars = bar4();
		expect(swapBeats(bars, 0, 1, 1)).toBe(bars);
		expect(swapBeats(bars, 0, 0, 9)).toBe(bars);
		expect(swapBeats(bars, 0, -1, 1)).toBe(bars);
		expect(swapBeats(bars, 4, 0, 1)).toBe(bars);
	});

	it("touches only the addressed bar", () => {
		const bars = swapBeats([bar4()[0], emptyBar()], 1, 0, 1);
		expect(bars[0].beats[0]).toEqual(["D", ""]);
	});
});
