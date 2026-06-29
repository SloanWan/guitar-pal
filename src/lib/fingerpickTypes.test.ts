// Unit test examples for durationToWidthMultiplier.
// Run with: npx vitest (or npx jest) once a test runner is configured.
import { durationToWidthMultiplier } from "./fingerpickTypes";

describe("durationToWidthMultiplier", () => {
	it("returns 4 for whole note", () => {
		expect(durationToWidthMultiplier("whole")).toBe(4);
	});

	it("returns 2 for half note", () => {
		expect(durationToWidthMultiplier("half")).toBe(2);
	});

	it("returns 1 for quarter note (base unit)", () => {
		expect(durationToWidthMultiplier("quarter")).toBe(1);
	});

	it("returns 0.5 for eighth note", () => {
		expect(durationToWidthMultiplier("eighth")).toBe(0.5);
	});

	it("returns 0.25 for sixteenth note", () => {
		expect(durationToWidthMultiplier("sixteenth")).toBe(0.25);
	});

	it("returns 1 for rest (same width as quarter)", () => {
		expect(durationToWidthMultiplier("rest")).toBe(1);
	});

	it("maintains correct ratios between durations", () => {
		const whole = durationToWidthMultiplier("whole");
		const half = durationToWidthMultiplier("half");
		const quarter = durationToWidthMultiplier("quarter");
		const eighth = durationToWidthMultiplier("eighth");
		const sixteenth = durationToWidthMultiplier("sixteenth");

		expect(whole / half).toBe(2);
		expect(whole / quarter).toBe(4);
		expect(whole / eighth).toBe(8);
		expect(whole / sixteenth).toBe(16);
		expect(half / quarter).toBe(2);
		expect(quarter / eighth).toBe(2);
		expect(eighth / sixteenth).toBe(2);
	});
});
