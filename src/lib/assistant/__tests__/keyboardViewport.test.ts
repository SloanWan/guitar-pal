import { describe, it, expect } from "vitest";
import { fitPanelHeight, sameArea, visibleArea } from "@/lib/assistant/keyboardViewport";

describe("visibleArea", () => {
	it("sees no keyboard when the visible area is the whole window", () => {
		expect(visibleArea({ vvHeight: 844, vvOffsetTop: 0, vvScale: 1, layoutHeight: 844 })).toEqual({
			top: 0,
			height: 844,
			keyboard: false,
		});
	});

	it("sees a phone's keyboard, panned or not", () => {
		// iPhone 15 portrait: the keyboard and its bar take about 336px
		expect(visibleArea({ vvHeight: 508, vvOffsetTop: 0, vvScale: 1, layoutHeight: 844 }).keyboard).toBe(true);
		expect(visibleArea({ vvHeight: 508, vvOffsetTop: 300, vvScale: 1, layoutHeight: 844 })).toEqual({
			top: 300,
			height: 508,
			keyboard: true,
		});
	});

	it("takes a toolbar coming back for chrome, not a keyboard", () => {
		expect(visibleArea({ vvHeight: 790, vvOffsetTop: 0, vvScale: 1, layoutHeight: 844 }).keyboard).toBe(false);
	});

	it("takes pinch zoom for zoom, not a keyboard", () => {
		expect(visibleArea({ vvHeight: 422, vvOffsetTop: 200, vvScale: 2, layoutHeight: 844 }).keyboard).toBe(false);
		// zoomed in with the keyboard up as well
		expect(visibleArea({ vvHeight: 254, vvOffsetTop: 200, vvScale: 2, layoutHeight: 844 }).keyboard).toBe(true);
	});
});

describe("sameArea", () => {
	const area = { top: 0, height: 508, keyboard: true };

	it("ignores sub-pixel jitter", () => {
		expect(sameArea(area, { top: 0.4, height: 508.6, keyboard: true })).toBe(true);
	});

	it("tells a move, a resize and the keyboard apart", () => {
		expect(sameArea(null, area)).toBe(false);
		expect(sameArea(area, { ...area, top: 20 })).toBe(false);
		expect(sameArea(area, { ...area, height: 400 })).toBe(false);
		expect(sameArea(area, { ...area, keyboard: false })).toBe(false);
	});
});

describe("fitPanelHeight", () => {
	// an iPad's popover: under a 56px header, its own 52px head, then the conversation
	const fit = { top: 116, below: 20, min: 160 };

	it("keeps the chosen height while it fits above the keyboard", () => {
		expect(fitPanelHeight({ ...fit, wanted: 480, visibleHeight: 1024 })).toBe(480);
	});

	it("wears it shorter so the composer sits on the keyboard", () => {
		// iPad landscape with the keyboard up: 768 - 398
		expect(fitPanelHeight({ ...fit, wanted: 480, visibleHeight: 370 })).toBe(234);
	});

	it("never goes below the minimum", () => {
		expect(fitPanelHeight({ ...fit, wanted: 480, visibleHeight: 200 })).toBe(160);
	});

	it("rounds to whole pixels", () => {
		expect(fitPanelHeight({ ...fit, wanted: 480, visibleHeight: 370.6 })).toBe(235);
	});
});
