import { describe, expect, it } from "vitest";
import { leadInX, type LeadInMeasure } from "../playheadLeadIn";

// A 4/4 bar at one second a beat, its note area from x 100 to 500.
const bar = (slots: LeadInMeasure["slots"]): LeadInMeasure => ({ slots, end: 4, left: 100, right: 500 });

describe("leadInX", () => {
	// 心墙: a half rest and a quarter rest, both drawn, then the first note on beat 4.
	const pickup = bar([
		{ start: 0, x: 120, soundsAt: null },
		{ start: 2, x: 260, soundsAt: null },
		{ start: 3, x: 380, soundsAt: 3 },
	]);

	it("moves across drawn rests while they last, never waiting for the first note", () => {
		expect(leadInX(pickup, 0)).toBe(120);
		expect(leadInX(pickup, 1)).toBe(190);
		expect(leadInX(pickup, 2)).toBe(260);
		expect(leadInX(pickup, 2.5)).toBe(320);
		expect(leadInX(pickup, 3)).toBe(380);
	});

	it("drifts from the left edge when the opening slots draw nothing", () => {
		const empty = bar([
			{ start: 0, x: null, soundsAt: null },
			{ start: 2, x: 300, soundsAt: 2 },
		]);
		expect(leadInX(empty, 0)).toBe(100);
		expect(leadInX(empty, 1)).toBe(200);
		expect(leadInX(empty, 2)).toBe(300);
	});

	it("passes over an empty slot between a rest and the first note", () => {
		const mixed = bar([
			{ start: 0, x: 120, soundsAt: null },
			{ start: 1, x: null, soundsAt: null },
			{ start: 2, x: 320, soundsAt: 2 },
		]);
		expect(leadInX(mixed, 1)).toBe(220);
	});

	it("crosses a silent bar to its right edge by the bar's end", () => {
		const silent = bar([{ start: 0, x: 140, soundsAt: null }]);
		expect(leadInX(silent, 0)).toBe(140);
		expect(leadInX(silent, 2)).toBe(320);
		expect(leadInX(silent, 4)).toBe(500);
	});

	it("reaches a rolled chord as it starts to sound, ahead of its beat", () => {
		const rolled = bar([
			{ start: 0, x: 120, soundsAt: null },
			{ start: 2, x: 320, soundsAt: 1.95 },
		]);
		expect(leadInX(rolled, 1.95)).toBe(320);
	});
});
