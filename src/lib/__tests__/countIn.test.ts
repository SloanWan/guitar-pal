import { describe, expect, it } from "vitest";
import {
	COUNT_INS,
	DEFAULT_COUNT_IN,
	countInCues,
	countInSeconds,
	formatCountIn,
	readCountIn,
} from "@/lib/countIn";

describe("countInCues", () => {
	it("cues each second from the press to the second before the first note", () => {
		expect(countInCues(3).map((c) => [c.at, c.left])).toEqual([
			[0, 3],
			[1, 2],
			[2, 1],
		]);
	});

	it("marks only the last three as the count", () => {
		const cues = countInCues(10);
		expect(cues).toHaveLength(10);
		expect(cues.filter((c) => c.accent).map((c) => c.left)).toEqual([3, 2, 1]);
		expect(cues[0]).toEqual({ at: 0, left: 10, accent: false });
	});

	it("has nothing to cue without a wait", () => {
		expect(countInCues(0)).toEqual([]);
		expect(countInCues(-2)).toEqual([]);
	});
});

describe("countInSeconds", () => {
	it("waits the chosen seconds only while on", () => {
		expect(countInSeconds({ on: true, seconds: 10, cue: false })).toBe(10);
		expect(countInSeconds({ on: false, seconds: 10, cue: true })).toBe(0);
	});
});

describe("stored setting", () => {
	it("reads back what it wrote, for every wait offered", () => {
		for (const seconds of COUNT_INS) {
			const setting = { on: true, seconds, cue: false };
			expect(readCountIn(formatCountIn(setting))).toEqual(setting);
		}
		expect(readCountIn(formatCountIn(DEFAULT_COUNT_IN))).toEqual(DEFAULT_COUNT_IN);
	});

	it("refuses a wait it does not offer, a missing field, or no JSON at all", () => {
		expect(readCountIn('{"on":true,"seconds":4,"cue":true}')).toBeNull();
		expect(readCountIn('{"on":true,"seconds":5}')).toBeNull();
		expect(readCountIn("null")).toBeNull();
		expect(readCountIn("5")).toBeNull();
		expect(readCountIn("{")).toBeNull();
	});
});
