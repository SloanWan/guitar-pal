import { describe, expect, it } from "vitest";
import { percentOf, snapToPoints } from "@/lib/snap";

describe("snapToPoints", () => {
	const DETENTS = [60, 90, 120];
	it("lands on a point within reach", () => {
		expect(snapToPoints(88, DETENTS, 3)).toBe(90);
		expect(snapToPoints(123, DETENTS, 3)).toBe(120);
	});
	it("leaves a value out of reach alone", () => {
		expect(snapToPoints(100, DETENTS, 3)).toBe(100);
	});
	it("takes the nearer of two points in reach", () => {
		expect(snapToPoints(4, [0, 5], 5)).toBe(5);
		expect(snapToPoints(2, [0, 5], 5)).toBe(0);
	});
});

describe("percentOf", () => {
	it("places a value along its range", () => {
		expect(percentOf(90, 40, 240)).toBe(25);
		expect(percentOf(40, 40, 240)).toBe(0);
	});
	it("is 0 for an empty range", () => {
		expect(percentOf(5, 5, 5)).toBe(0);
	});
});
