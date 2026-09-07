import { describe, it, expect } from "vitest";
import {
	TICK_LEVELS,
	beatSteps,
	tickLevelLabel,
	ticksPerBeat,
	type TickLevel,
} from "@/lib/strumMetronome";
import { beatsPerBar, type Meter } from "@/lib/strumMeter";

const FOUR_FOUR: Meter = [4, 4];
const THREE_FOUR: Meter = [3, 4];
const SIX_EIGHT: Meter = [6, 8];
const TWELVE_EIGHT: Meter = [12, 8];

const perBar = (meter: Meter, level: TickLevel) =>
	beatsPerBar(meter) * ticksPerBeat(meter, level);

describe("ticksPerBeat", () => {
	it("divides a simple beat in two and a compound beat in three", () => {
		// The entire difference between the meter families, on one line.
		expect(ticksPerBeat(FOUR_FOUR, "division")).toBe(2);
		expect(ticksPerBeat(SIX_EIGHT, "division")).toBe(3);
	});

	it("counts one click per beat at the beat level, whatever the meter", () => {
		for (const meter of [FOUR_FOUR, THREE_FOUR, SIX_EIGHT, TWELVE_EIGHT]) {
			expect(ticksPerBeat(meter, "beat")).toBe(1);
		}
	});

	it("halves the division again at the subdivision level", () => {
		expect(ticksPerBeat(FOUR_FOUR, "subdivision")).toBe(4);
		expect(ticksPerBeat(SIX_EIGHT, "subdivision")).toBe(6);
	});

	describe("clicks per bar", () => {
		it("matches the table for 4/4", () => {
			expect(perBar(FOUR_FOUR, "beat")).toBe(4);
			expect(perBar(FOUR_FOUR, "division")).toBe(8);
			expect(perBar(FOUR_FOUR, "subdivision")).toBe(16);
		});

		it("matches the table for 6/8", () => {
			expect(perBar(SIX_EIGHT, "beat")).toBe(2);
			expect(perBar(SIX_EIGHT, "division")).toBe(6);
			expect(perBar(SIX_EIGHT, "subdivision")).toBe(12);
		});

		it("matches the table for 12/8", () => {
			expect(perBar(TWELVE_EIGHT, "beat")).toBe(4);
			expect(perBar(TWELVE_EIGHT, "division")).toBe(12);
			expect(perBar(TWELVE_EIGHT, "subdivision")).toBe(24);
		});

		it("never counts fewer clicks at a finer level", () => {
			for (const meter of [FOUR_FOUR, THREE_FOUR, SIX_EIGHT, TWELVE_EIGHT]) {
				expect(perBar(meter, "division")).toBeGreaterThan(perBar(meter, "beat"));
				expect(perBar(meter, "subdivision")).toBeGreaterThan(perBar(meter, "division"));
			}
		});
	});
});

describe("tickLevelLabel", () => {
	it("renders 4/4 exactly as it did before meters existed", () => {
		expect(TICK_LEVELS.map((l) => tickLevelLabel(FOUR_FOUR, l))).toEqual([
			"1/4",
			"1/8",
			"1/16",
		]);
	});

	it("calls the compound beat what it is: a dotted quarter, three eighths", () => {
		expect(TICK_LEVELS.map((l) => tickLevelLabel(SIX_EIGHT, l))).toEqual([
			"3/8",
			"1/8",
			"1/16",
		]);
	});

	it("gives 3/4 the same note values as 4/4, since only the bar length differs", () => {
		expect(TICK_LEVELS.map((l) => tickLevelLabel(THREE_FOUR, l))).toEqual(
			TICK_LEVELS.map((l) => tickLevelLabel(FOUR_FOUR, l)),
		);
	});

	it("gives 12/8 the same note values as 6/8", () => {
		expect(TICK_LEVELS.map((l) => tickLevelLabel(TWELVE_EIGHT, l))).toEqual(
			TICK_LEVELS.map((l) => tickLevelLabel(SIX_EIGHT, l)),
		);
	});
});

describe("beatSteps", () => {
	const cells = (steps: ReturnType<typeof beatSteps>) =>
		steps.map((s) => s.cellIndex);
	const ticks = (steps: ReturnType<typeof beatSteps>) => steps.map((s) => s.tick);

	it("leaves the two grids aligned when they already match", () => {
		const steps = beatSteps(3, 3);
		expect(steps).toHaveLength(3);
		expect(cells(steps)).toEqual([0, 1, 2]);
		expect(ticks(steps)).toEqual([true, true, true]);
	});

	it("subsumes the phantom-cell case the scheduler used to special-case", () => {
		// Two struck cells, four clicks: the old code fabricated empty cells to
		// get the click count right. Here it falls out of the merge.
		const steps = beatSteps(2, 4);
		expect(steps).toHaveLength(4);
		expect(cells(steps)).toEqual([0, null, 1, null]);
		expect(ticks(steps)).toEqual([true, true, true, true]);
		expect(steps.map((s) => s.offset)).toEqual([0, 0.25, 0.5, 0.75]);
	});

	it("counts a three-cell compound beat in sixteenths, which was impossible before", () => {
		// Six clicks over three cells: the clicks between cells are exactly what
		// a cell-driven scheduler had nowhere to put.
		const steps = beatSteps(3, 6);
		expect(steps).toHaveLength(6);
		expect(cells(steps)).toEqual([0, null, 1, null, 2, null]);
		expect(ticks(steps).every(Boolean)).toBe(true);
	});

	it("clicks less often than the grid strikes when the level is coarser", () => {
		const steps = beatSteps(6, 3);
		expect(steps).toHaveLength(6);
		expect(cells(steps)).toEqual([0, 1, 2, 3, 4, 5]);
		expect(ticks(steps)).toEqual([true, false, true, false, true, false]);
	});

	it("falls back to the least common multiple when neither divides the other", () => {
		// Four sixteenths against a triplet click: twelve steps, and the two only
		// coincide on the beat itself.
		const steps = beatSteps(4, 3);
		expect(steps).toHaveLength(12);
		expect(cells(steps)).toEqual([0, null, null, 1, null, null, 2, null, null, 3, null, null]);
		expect(ticks(steps)).toEqual([
			true, false, false, false, true, false, false, false, true, false, false, false,
		]);
	});

	it("always strikes and clicks together on the downbeat", () => {
		for (const c of [1, 2, 3, 4, 6]) {
			for (const t of [1, 2, 3, 4, 6]) {
				const first = beatSteps(c, t)[0];
				expect(first.offset).toBe(0);
				expect(first.cellIndex).toBe(0);
				expect(first.tick).toBe(true);
			}
		}
	});

	it("emits every cell exactly once, in order", () => {
		for (const c of [1, 2, 3, 4, 6]) {
			for (const t of [1, 2, 3, 4, 6]) {
				const emitted = beatSteps(c, t)
					.map((s) => s.cellIndex)
					.filter((i): i is number => i !== null);
				expect(emitted).toEqual(Array.from({ length: c }, (_, i) => i));
			}
		}
	});

	it("emits exactly the requested number of clicks", () => {
		for (const c of [1, 2, 3, 4, 6]) {
			for (const t of [1, 2, 3, 4, 6]) {
				expect(beatSteps(c, t).filter((s) => s.tick)).toHaveLength(t);
			}
		}
	});

	it("stays short enough for the scheduler to walk every beat", () => {
		for (const c of [1, 2, 3, 4, 6]) {
			for (const t of [1, 2, 3, 4, 6]) {
				expect(beatSteps(c, t).length).toBeLessThanOrEqual(12);
			}
		}
	});

	it("spaces steps evenly across the beat", () => {
		const steps = beatSteps(3, 2);
		expect(steps).toHaveLength(6);
		steps.forEach((s, i) => expect(s.offset).toBeCloseTo(i / 6, 10));
	});

	it("survives nonsense counts rather than dividing by zero", () => {
		expect(() => beatSteps(0, 0)).not.toThrow();
		expect(beatSteps(0, 0)).toHaveLength(1);
		expect(beatSteps(-3, 2)).toHaveLength(2);
	});
});
