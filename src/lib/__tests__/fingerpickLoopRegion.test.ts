import { describe, it, expect } from "vitest";
import type { MeasureBoundary } from "@/lib/fingerpickScheduler";
import {
	clampToBounds,
	inPass,
	locateInPass,
	passLength,
	regionBounds,
	regionForSelection,
	timelineOffset,
	toPassTime,
	wholePattern,
} from "@/lib/fingerpickLoopRegion";

// Four measures of two seconds each.
const boundaries: MeasureBoundary[] = [
	{ measureIndex: 0, startTime: 0 },
	{ measureIndex: 1, startTime: 2 },
	{ measureIndex: 2, startTime: 4 },
	{ measureIndex: 3, startTime: 6 },
];
const DURATION = 8;

describe("regionBounds", () => {
	it("is the whole pattern without a region", () => {
		expect(regionBounds(boundaries, DURATION, null)).toEqual({ start: 0, end: 8 });
	});
	it("covers a middle region from its first measure to the start of the next one", () => {
		expect(regionBounds(boundaries, DURATION, { startMeasure: 1, endMeasure: 2 })).toEqual({
			start: 2,
			end: 6,
		});
	});
	it("starts at zero for the first measure and ends at the pattern's end for the last", () => {
		expect(regionBounds(boundaries, DURATION, { startMeasure: 0, endMeasure: 0 })).toEqual({
			start: 0,
			end: 2,
		});
		expect(regionBounds(boundaries, DURATION, { startMeasure: 2, endMeasure: 3 })).toEqual({
			start: 4,
			end: 8,
		});
	});
	it("bounds a single measure", () => {
		expect(regionBounds(boundaries, DURATION, { startMeasure: 2, endMeasure: 2 })).toEqual({
			start: 4,
			end: 6,
		});
	});
	it("swaps a reversed pair and clamps indices outside the pattern", () => {
		expect(regionBounds(boundaries, DURATION, { startMeasure: 3, endMeasure: 1 })).toEqual({
			start: 2,
			end: 8,
		});
		expect(regionBounds(boundaries, DURATION, { startMeasure: -4, endMeasure: 99 })).toEqual({
			start: 0,
			end: 8,
		});
	});
	it("falls back to the whole pattern when there are no measures to bound", () => {
		expect(regionBounds([], DURATION, { startMeasure: 0, endMeasure: 0 })).toEqual({
			start: 0,
			end: 8,
		});
	});
	it("uses uneven measure lengths as they are", () => {
		const uneven: MeasureBoundary[] = [
			{ measureIndex: 0, startTime: 0 },
			{ measureIndex: 1, startTime: 1.5 },
			{ measureIndex: 2, startTime: 4.25 },
		];
		expect(regionBounds(uneven, 5, { startMeasure: 1, endMeasure: 1 })).toEqual({
			start: 1.5,
			end: 4.25,
		});
	});
});

describe("pass time helpers", () => {
	const bounds = { start: 2, end: 6 };
	it("measures the pass and converts pattern time into pass time", () => {
		expect(passLength(bounds)).toBe(4);
		expect(toPassTime(3.5, bounds)).toBe(1.5);
		expect(toPassTime(2, bounds)).toBe(0);
	});
	it("plays only what lies inside the bounds and at or after the resume point", () => {
		expect(inPass(2, bounds, 2)).toBe(true);
		expect(inPass(5.99, bounds, 2)).toBe(true);
		expect(inPass(6, bounds, 2)).toBe(false);
		expect(inPass(1.9, bounds, 0)).toBe(false);
		expect(inPass(3, bounds, 3.5)).toBe(false);
		expect(inPass(3.5, bounds, 3.5)).toBe(true);
	});
	it("keeps a time inside the pass and restarts the pass for one outside it", () => {
		expect(clampToBounds(4, bounds)).toBe(4);
		expect(clampToBounds(2, bounds)).toBe(2);
		expect(clampToBounds(6, bounds)).toBe(2);
		expect(clampToBounds(0.5, bounds)).toBe(2);
	});
	it("matches the pre-region behaviour on the whole pattern: events before a resume point are skipped", () => {
		const whole = wholePattern(8);
		// A rolled first slot anchors some strings slightly before t=0; the old
		// `event.time < startOffset` filter dropped them at a pass start, and so does this.
		expect(inPass(-0.02, whole, 0)).toBe(false);
		expect(inPass(0, whole, 0)).toBe(true);
		expect(inPass(7.999, whole, 0)).toBe(true);
	});
});

describe("locateInPass / timelineOffset", () => {
	it("reduces to the whole-pattern arithmetic without a region", () => {
		const whole = wholePattern(8);
		const gap = 1;
		for (const total of [0, 3.25, 7.99, 8, 8.5, 9, 12.5, 27]) {
			const passDuration = 8 + gap;
			const expectedPass = Math.floor(total / passDuration);
			const expectedElapsed = total - expectedPass * passDuration;
			expect(locateInPass(total, whole, gap)).toEqual({
				passIndex: expectedPass,
				elapsed: expectedElapsed,
			});
			expect(timelineOffset(expectedPass, whole, gap, expectedElapsed)).toBeCloseTo(total, 9);
		}
	});
	it("reports pattern time inside a region, pass after pass", () => {
		const bounds = { start: 2, end: 6 };
		expect(locateInPass(0, bounds, 0)).toEqual({ passIndex: 0, elapsed: 2 });
		expect(locateInPass(3, bounds, 0)).toEqual({ passIndex: 0, elapsed: 5 });
		expect(locateInPass(4, bounds, 0)).toEqual({ passIndex: 1, elapsed: 2 });
		expect(locateInPass(9.5, bounds, 0)).toEqual({ passIndex: 2, elapsed: 3.5 });
	});
	it("runs past the region's end during a loop gap, as the whole pattern always did", () => {
		const bounds = { start: 2, end: 6 };
		const { passIndex, elapsed } = locateInPass(4.5, bounds, 1);
		expect(passIndex).toBe(0);
		expect(elapsed).toBeCloseTo(6.5, 9);
	});
	it("inverts locateInPass for any pass and time inside the region", () => {
		const bounds = { start: 2, end: 6 };
		for (const gap of [0, 0.5]) {
			for (const total of [0.1, 2.9, 4.4, 10]) {
				const { passIndex, elapsed } = locateInPass(total, bounds, gap);
				expect(timelineOffset(passIndex, bounds, gap, elapsed)).toBeCloseTo(total, 9);
			}
		}
	});
	it("copes with an empty pass instead of dividing by zero", () => {
		expect(locateInPass(3, { start: 2, end: 2 }, 0)).toEqual({ passIndex: 0, elapsed: 5 });
	});
});

describe("regionForSelection", () => {
	// Rendered measures 0..3 with measures 1–2 repeated: 0 1 2 1 2 3.
	const origins = [0, 1, 2, 1, 2, 3];
	it("is the identity without repeats", () => {
		expect(regionForSelection([0, 1, 2, 3], { startMeasure: 1, endMeasure: 2 })).toEqual({
			startMeasure: 1,
			endMeasure: 2,
		});
	});
	it("plays the repeat when the section contains it", () => {
		expect(regionForSelection(origins, { startMeasure: 1, endMeasure: 2 })).toEqual({
			startMeasure: 1,
			endMeasure: 4,
		});
	});
	it("stops before the repeat when the section only reaches into it", () => {
		expect(regionForSelection(origins, { startMeasure: 0, endMeasure: 1 })).toEqual({
			startMeasure: 0,
			endMeasure: 1,
		});
	});
	it("uses the occurrence that reaches the section's end", () => {
		// Measure 2 then 3 only run together after the repeat: expanded 4..5.
		expect(regionForSelection(origins, { startMeasure: 2, endMeasure: 3 })).toEqual({
			startMeasure: 4,
			endMeasure: 5,
		});
	});
	it("plays a single measure's first occurrence", () => {
		expect(regionForSelection(origins, { startMeasure: 1, endMeasure: 1 })).toEqual({
			startMeasure: 1,
			endMeasure: 1,
		});
	});
	it("accepts a reversed selection and falls back to first occurrences without a run", () => {
		expect(regionForSelection(origins, { startMeasure: 2, endMeasure: 1 })).toEqual({
			startMeasure: 1,
			endMeasure: 4,
		});
		expect(regionForSelection([], { startMeasure: 2, endMeasure: 3 })).toEqual({
			startMeasure: 2,
			endMeasure: 3,
		});
	});
});
