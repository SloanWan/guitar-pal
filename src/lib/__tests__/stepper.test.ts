import { describe, expect, it } from "vitest";
import { TAP_RESET_MS, TAP_WINDOW, clampToRange, pushTap, stepValue, tapTempo } from "@/lib/stepper";

const BPM = { min: 40, max: 240, step: 1 };

describe("clampToRange", () => {
	it("holds a value inside the bounds", () => {
		expect(clampToRange(12, BPM)).toBe(40);
		expect(clampToRange(300, BPM)).toBe(240);
		expect(clampToRange(96, BPM)).toBe(96);
	});
	it("snaps to the step grid counted from min", () => {
		expect(clampToRange(96.4, BPM)).toBe(96);
		expect(clampToRange(7, { min: 1, max: 9, step: 2 })).toBe(7);
		expect(clampToRange(6, { min: 1, max: 9, step: 2 })).toBe(7);
	});
	it("keeps a fractional step free of float noise", () => {
		expect(clampToRange(0.1 + 0.2, { min: 0, max: 1, step: 0.1 })).toBe(0.3);
	});
});

describe("stepValue", () => {
	it("moves one step either way", () => {
		expect(stepValue(96, 1, BPM)).toBe(97);
		expect(stepValue(95, -1, { ...BPM, step: 5 })).toBe(90);
		// off the grid, a step lands back on it
		expect(stepValue(96, -1, { ...BPM, step: 5 })).toBe(90);
	});
	it("stops at a bound", () => {
		expect(stepValue(240, 1, BPM)).toBe(240);
		expect(stepValue(40, -1, BPM)).toBe(40);
	});
});

describe("tap tempo", () => {
	const run = (times: number[]) => times.reduce<number[]>((taps, t) => pushTap(taps, t), []);

	it("needs two taps", () => {
		expect(tapTempo([])).toBeNull();
		expect(tapTempo(run([0]))).toBeNull();
	});
	it("averages the intervals", () => {
		expect(tapTempo(run([0, 500]))).toBe(120);
		// 480, 520, 500 → mean 500ms → 120 BPM
		expect(tapTempo(run([0, 480, 1000, 1500]))).toBe(120);
	});
	it("keeps only the latest window of intervals", () => {
		const taps = run([0, 1000, 1500, 2000, 2500, 3000]);
		expect(taps).toHaveLength(TAP_WINDOW + 1);
		expect(tapTempo(taps)).toBe(120);
	});
	it("starts a new run after a long pause", () => {
		const taps = run([0, 500, 500 + TAP_RESET_MS + 1]);
		expect(taps).toHaveLength(1);
		expect(tapTempo(taps)).toBeNull();
	});
});
