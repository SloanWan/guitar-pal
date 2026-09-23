import { describe, expect, it } from "vitest";
import { captionIndex, chapterProgress, quantize, seg } from "../progress";

describe("seg", () => {
	it("maps a sub-range of the chapter onto 0..1 and clamps outside it", () => {
		expect(seg(0.1, 0.2, 0.6)).toBe(0);
		expect(seg(0.4, 0.2, 0.6)).toBeCloseTo(0.5);
		expect(seg(0.9, 0.2, 0.6)).toBe(1);
	});
});

describe("captionIndex", () => {
	it("gives each caption an equal share and holds the last to the end", () => {
		expect(captionIndex(0, 4)).toBe(0);
		expect(captionIndex(0.26, 4)).toBe(1);
		expect(captionIndex(0.5, 4)).toBe(2);
		expect(captionIndex(0.99, 4)).toBe(3);
		expect(captionIndex(1, 4)).toBe(3);
	});
	it("is safe for an empty caption list", () => {
		expect(captionIndex(0.5, 0)).toBe(0);
	});
});

describe("chapterProgress", () => {
	const viewport = { viewportTop: 52, viewportHeight: 700 };
	it("is 0 while the section's top has not reached the scrollport top", () => {
		expect(chapterProgress({ ...viewport, sectionTop: 300, sectionHeight: 2100 })).toBe(0);
		expect(chapterProgress({ ...viewport, sectionTop: 52, sectionHeight: 2100 })).toBe(0);
	});
	it("is 1 once the section's bottom reaches the scrollport bottom", () => {
		// bottom = top + height = 52 + 700 when top = 52 - 1400
		expect(chapterProgress({ ...viewport, sectionTop: 52 - 1400, sectionHeight: 2100 })).toBe(1);
		expect(chapterProgress({ ...viewport, sectionTop: -3000, sectionHeight: 2100 })).toBe(1);
	});
	it("is linear in between", () => {
		expect(chapterProgress({ ...viewport, sectionTop: 52 - 700, sectionHeight: 2100 })).toBeCloseTo(0.5);
	});
	it("treats a section no taller than the scrollport as a switch", () => {
		expect(chapterProgress({ ...viewport, sectionTop: 100, sectionHeight: 500 })).toBe(0);
		expect(chapterProgress({ ...viewport, sectionTop: 10, sectionHeight: 500 })).toBe(1);
	});
});

describe("quantize", () => {
	it("snaps to 1/200 steps and clamps", () => {
		expect(quantize(0.1234)).toBeCloseTo(0.125);
		expect(quantize(-1)).toBe(0);
		expect(quantize(2)).toBe(1);
	});
});
