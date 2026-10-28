import { describe, it, expect } from "vitest";
import { speedUpLine, trainerBpm, trainerPercent } from "@/lib/speedTrainer";

const trainer = { start: 70, step: 5 };

describe("trainerPercent", () => {
	it("starts at the start share and adds a step a pass", () => {
		expect(trainerPercent(0, trainer)).toBe(70);
		expect(trainerPercent(1, trainer)).toBe(75);
		expect(trainerPercent(4, trainer)).toBe(90);
	});
	it("holds at the tempo once it gets there", () => {
		expect(trainerPercent(6, trainer)).toBe(100);
		expect(trainerPercent(40, { start: 95, step: 10 })).toBe(100);
	});
	it("treats a pass before the run as its first", () => {
		expect(trainerPercent(-2, trainer)).toBe(70);
	});
});

describe("trainerBpm", () => {
	it("rounds to whole beats", () => {
		expect(trainerBpm(100, 70)).toBe(70);
		expect(trainerBpm(66, 75)).toBe(50);
		expect(trainerBpm(90, 100)).toBe(90);
	});
});

describe("speedUpLine", () => {
	it("says what stops it, what it will do, and where it is", () => {
		expect(speedUpLine(100, trainer, { loop: false, on: true, progress: null })).toMatch(/Needs Loop/);
		expect(speedUpLine(100, trainer, { loop: true, on: false, progress: null })).toBe("Off — every pass at 100 BPM.");
		expect(speedUpLine(100, trainer, { loop: true, on: true, progress: null })).toBe("Starts at 70 BPM, +5% a pass, holds at 100.");
		expect(speedUpLine(100, trainer, { loop: true, on: true, progress: { pass: 2, percent: 80 } })).toBe("Pass 3 · 80 of 100 BPM");
		expect(speedUpLine(100, trainer, { loop: true, on: true, progress: { pass: 6, percent: 100 } })).toBe("Pass 7 · 100 of 100 BPM — at tempo");
	});
});
