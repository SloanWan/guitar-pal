import { describe, it, expect } from "vitest";
import {
	DEFAULT_METER,
	SUPPORTED_METERS,
	beatLabels,
	allowedCellsPerBeat,
	beatUnitLabel,
	beatsPerBar,
	isCompound,
	isSupportedMeter,
	meterLabel,
	metersEqual,
	naturalCellsPerBeat,
	normalizeMeter,
	stepCellsPerBeat,
	type Meter,
} from "@/lib/strumMeter";

const FOUR_FOUR: Meter = [4, 4];
const THREE_FOUR: Meter = [3, 4];
const SIX_EIGHT: Meter = [6, 8];
const TWELVE_EIGHT: Meter = [12, 8];

describe("strumMeter", () => {
	describe("isCompound", () => {
		it("counts 6/8 and 12/8 as compound", () => {
			expect(isCompound(SIX_EIGHT)).toBe(true);
			expect(isCompound(TWELVE_EIGHT)).toBe(true);
			expect(isCompound([9, 8])).toBe(true);
		});

		it("does not count simple meters as compound", () => {
			expect(isCompound(FOUR_FOUR)).toBe(false);
			expect(isCompound(THREE_FOUR)).toBe(false);
			expect(isCompound([2, 4])).toBe(false);
		});

		it("excludes 3/8, which is counted in one", () => {
			expect(isCompound([3, 8])).toBe(false);
		});

		it("does not treat a /4 meter divisible by three as compound", () => {
			// 6/4 exists but is not what this app means by compound.
			expect(isCompound([6, 4])).toBe(false);
		});
	});

	describe("beatsPerBar", () => {
		it("counts a compound meter in dotted beats, not in its bottom number", () => {
			expect(beatsPerBar(SIX_EIGHT)).toBe(2);
			expect(beatsPerBar(TWELVE_EIGHT)).toBe(4);
		});

		it("counts a simple meter in its top number", () => {
			expect(beatsPerBar(FOUR_FOUR)).toBe(4);
			expect(beatsPerBar(THREE_FOUR)).toBe(3);
			expect(beatsPerBar([2, 4])).toBe(2);
		});
	});

	describe("naturalCellsPerBeat", () => {
		it("divides a compound beat in three and a simple beat in two", () => {
			expect(naturalCellsPerBeat(SIX_EIGHT)).toBe(3);
			expect(naturalCellsPerBeat(FOUR_FOUR)).toBe(2);
		});

		it("gives every supported meter a bar the grid can draw", () => {
			for (const meter of SUPPORTED_METERS) {
				const cells = beatsPerBar(meter) * naturalCellsPerBeat(meter);
				expect(cells).toBeGreaterThan(0);
				expect(naturalCellsPerBeat(meter)).toBeLessThanOrEqual(4);
			}
		});

		it("keeps 6/8 and 12/8 at six and twelve cells", () => {
			expect(beatsPerBar(SIX_EIGHT) * naturalCellsPerBeat(SIX_EIGHT)).toBe(6);
			expect(beatsPerBar(TWELVE_EIGHT) * naturalCellsPerBeat(TWELVE_EIGHT)).toBe(12);
		});
	});

	describe("allowedCellsPerBeat", () => {
		it("gives a simple beat a continuous range", () => {
			expect(allowedCellsPerBeat(FOUR_FOUR)).toEqual([2, 3, 4]);
			expect(allowedCellsPerBeat(THREE_FOUR)).toEqual([2, 3, 4]);
		});

		it("gives a dotted beat only the divisions that name a note value", () => {
			// 3 eighths, or each of them halved. 4 and 5 name nothing in a dotted
			// beat, which is why this is a set rather than a range.
			expect(allowedCellsPerBeat(SIX_EIGHT)).toEqual([3, 6]);
			expect(allowedCellsPerBeat(TWELVE_EIGHT)).toEqual([3, 6]);
		});

		it("starts every meter at its natural division", () => {
			for (const meter of SUPPORTED_METERS) {
				expect(allowedCellsPerBeat(meter)[0]).toBe(naturalCellsPerBeat(meter));
			}
		});
	});

	describe("stepCellsPerBeat", () => {
		it("walks a simple beat one at a time", () => {
			expect(stepCellsPerBeat(FOUR_FOUR, 2, 1)).toBe(3);
			expect(stepCellsPerBeat(FOUR_FOUR, 3, 1)).toBe(4);
			expect(stepCellsPerBeat(FOUR_FOUR, 3, -1)).toBe(2);
		});

		it("jumps a dotted beat straight from three to six", () => {
			expect(stepCellsPerBeat(SIX_EIGHT, 3, 1)).toBe(6);
			expect(stepCellsPerBeat(SIX_EIGHT, 6, -1)).toBe(3);
		});

		it("stops at either end", () => {
			expect(stepCellsPerBeat(FOUR_FOUR, 4, 1)).toBeNull();
			expect(stepCellsPerBeat(FOUR_FOUR, 2, -1)).toBeNull();
			expect(stepCellsPerBeat(SIX_EIGHT, 6, 1)).toBeNull();
			expect(stepCellsPerBeat(SIX_EIGHT, 3, -1)).toBeNull();
		});

		it("pulls a count that is off the list onto the nearest legal one", () => {
			// A preset's one-cell beat, or a compound bar edited before the rules.
			expect(stepCellsPerBeat(SIX_EIGHT, 1, 1)).toBe(3);
			expect(stepCellsPerBeat(SIX_EIGHT, 4, 1)).toBe(6);
			expect(stepCellsPerBeat(SIX_EIGHT, 4, -1)).toBe(3);
			expect(stepCellsPerBeat(FOUR_FOUR, 1, 1)).toBe(2);
			expect(stepCellsPerBeat(FOUR_FOUR, 1, -1)).toBeNull();
		});
	});

	describe("beatLabels", () => {
		describe("simple meters keep exactly what StepGrid draws today", () => {
			// These four rows are the current BEAT_LABELS table. If they change,
			// every existing pattern is relabelled, so they are pinned here and the
			// StepGrid change becomes a pure refactor.
			it("one cell", () => {
				expect(beatLabels(FOUR_FOUR, 0, 1)).toEqual(["1", "", "+", ""]);
			});
			it("two cells", () => {
				expect(beatLabels(FOUR_FOUR, 2, 2)).toEqual(["3", "", "+", ""]);
			});
			it("three cells stay a triplet", () => {
				expect(beatLabels(FOUR_FOUR, 0, 3)).toEqual(["tri", "p", "let"]);
				expect(beatLabels(FOUR_FOUR, 3, 3)).toEqual(["tri", "p", "let"]);
			});
			it("four cells", () => {
				expect(beatLabels(FOUR_FOUR, 1, 4)).toEqual(["2", "e", "+", "a"]);
			});
		});

		describe("compound meters", () => {
			it("counts the three cells of a dotted beat instead of calling them a triplet", () => {
				expect(beatLabels(SIX_EIGHT, 0, 3)).toEqual(["1", "la", "li"]);
				expect(beatLabels(SIX_EIGHT, 1, 3)).toEqual(["2", "la", "li"]);
			});

			it("is the whole point: same cell count, different reading", () => {
				expect(beatLabels(SIX_EIGHT, 0, 3)).not.toEqual(beatLabels(FOUR_FOUR, 0, 3));
			});

			it("counts a dotted beat divided into sixteenths", () => {
				expect(beatLabels(SIX_EIGHT, 0, 6)).toEqual(["1", "ta", "la", "ta", "li", "ta"]);
				// The eighths stay where they were; the halves read as inserted.
				const eighths = beatLabels(SIX_EIGHT, 0, 3);
				const sixteenths = beatLabels(SIX_EIGHT, 0, 6);
				expect([sixteenths[0], sixteenths[2], sixteenths[4]]).toEqual(eighths);
			});

			it("numbers every dotted beat of 12/8", () => {
				expect(beatLabels(TWELVE_EIGHT, 3, 3)).toEqual(["4", "la", "li"]);
			});

			it("labels only the beat when a dotted beat is divided unusually", () => {
				expect(beatLabels(SIX_EIGHT, 0, 2)).toEqual(["1", ""]);
				expect(beatLabels(SIX_EIGHT, 1, 4)).toEqual(["2", "", "", ""]);
			});
		});

		it("fills the display columns for every beat shape the editor produces", () => {
			// paddedBeatCells widens a one- or two-cell simple beat to four columns;
			// a compound beat is always three. Anything else (a compound beat the
			// player has cut down by hand) is labelled short on purpose, and
			// StepGrid renders the missing columns blank rather than guessing.
			for (const meter of SUPPORTED_METERS) {
				const cells = naturalCellsPerBeat(meter);
				const columns = isCompound(meter) ? cells : 4;
				expect(beatLabels(meter, 0, cells)).toHaveLength(columns);
			}
		});

		it("labels a beat count no meter asks for without throwing", () => {
			expect(() => beatLabels(SIX_EIGHT, 0, 0)).not.toThrow();
			expect(beatLabels(FOUR_FOUR, 0, 0)).toEqual(["1"]);
		});
	});

	describe("beatUnitLabel", () => {
		it("names what the BPM counts", () => {
			expect(beatUnitLabel(SIX_EIGHT)).toBe("dotted quarter");
			expect(beatUnitLabel(FOUR_FOUR)).toBe("quarter");
			expect(beatUnitLabel([2, 2])).toBe("half");
		});
	});

	describe("reading a meter from outside the app", () => {
		it("accepts every supported meter", () => {
			for (const meter of SUPPORTED_METERS) {
				expect(isSupportedMeter([meter[0], meter[1]])).toBe(true);
			}
		});

		it("rejects anything else without throwing", () => {
			for (const junk of [null, undefined, "6/8", [6], [6, 8, 2], ["6", "8"], [5, 4], [7, 8], {}]) {
				expect(isSupportedMeter(junk)).toBe(false);
				expect(normalizeMeter(junk)).toEqual(DEFAULT_METER);
			}
		});

		it("falls back to 4/4, so a pattern stored before meters reads unchanged", () => {
			expect(normalizeMeter(undefined)).toEqual([4, 4]);
		});

		it("returns a fresh array rather than a reference into the supported list", () => {
			const normalized = normalizeMeter([6, 8]);
			expect(normalized).toEqual([6, 8]);
			expect(SUPPORTED_METERS).not.toContain(normalized);
		});
	});

	it("formats and compares meters", () => {
		expect(meterLabel(SIX_EIGHT)).toBe("6/8");
		expect(metersEqual([4, 4], DEFAULT_METER)).toBe(true);
		expect(metersEqual([6, 8], [12, 8])).toBe(false);
	});
});
