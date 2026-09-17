import { describe, it, expect, beforeEach } from "vitest";
import {
	clampScrollSpeed,
	clampShapeWidth,
	readLastPatternId,
	writeLastPatternId,
	SCROLL_SPEED_DEFAULT,
	SCROLL_SPEED_MAX,
	SCROLL_SPEED_MIN,
	CHORD_SHAPE_WIDTH_DEFAULT,
	CHORD_SHAPE_WIDTH_MAX,
	CHORD_SHAPE_WIDTH_MIN,
} from "../useFingerpickPrefs";

describe("clampScrollSpeed", () => {
	it("rounds and keeps the speed inside its range", () => {
		expect(clampScrollSpeed(10.4)).toBe(10);
		expect(clampScrollSpeed(0)).toBe(SCROLL_SPEED_MIN);
		expect(clampScrollSpeed(999)).toBe(SCROLL_SPEED_MAX);
	});
	it("falls back to the default for a value that is not a number", () => {
		expect(clampScrollSpeed(Number("abc"))).toBe(SCROLL_SPEED_DEFAULT);
	});
});

describe("clampShapeWidth", () => {
	it("rounds and keeps the width inside its range", () => {
		expect(clampShapeWidth(63.6)).toBe(64);
		expect(clampShapeWidth(1)).toBe(CHORD_SHAPE_WIDTH_MIN);
		expect(clampShapeWidth(1000)).toBe(CHORD_SHAPE_WIDTH_MAX);
	});
	it("falls back to the default for a value that is not a number", () => {
		expect(clampShapeWidth(NaN)).toBe(CHORD_SHAPE_WIDTH_DEFAULT);
	});
});

describe("last pattern id", () => {
	beforeEach(() => {
		localStorage.clear();
		window.history.replaceState(null, "", "/fingerpick");
	});
	it("is null when nothing was stored", () => {
		expect(readLastPatternId()).toBeNull();
	});
	it("round-trips through storage", () => {
		writeLastPatternId("waltz");
		expect(readLastPatternId()).toBe("waltz");
	});
	it("prefers a ?pattern= deep link over the stored id", () => {
		writeLastPatternId("waltz");
		window.history.replaceState(null, "", "/fingerpick?pattern=travis");
		expect(readLastPatternId()).toBe("travis");
	});
});
