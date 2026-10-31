import { describe, it, expect } from "vitest";
import {
	PICK_DROP_TAPS,
	PICK_DROP_WINDOW_MS,
	TUNING_MIDI,
	advanceTuning,
	isLateNight,
	registerTap,
	strumFromSweep,
} from "../eggs";

describe("advanceTuning", () => {
	function type(keys: string) {
		let progress = 0;
		const steps = [...keys].map((k) => {
			const step = advanceTuning(progress, k);
			progress = step.progress;
			return step;
		});
		return { steps, progress };
	}

	it("sounds each open string, low to high, and is done on the sixth", () => {
		const { steps } = type("EADGBE");
		expect(steps.map((s) => s.midi)).toEqual([...TUNING_MIDI]);
		expect(steps.map((s) => s.done)).toEqual([false, false, false, false, false, true]);
	});

	it("starts over after it is done, and ignores case", () => {
		const { steps } = type("eadgbeEA");
		expect(steps[5].done).toBe(true);
		expect(steps[6].midi).toBe(40);
		expect(steps[7].midi).toBe(45);
	});

	it("starts over on a wrong key, keeping a fresh E as the first string", () => {
		expect(advanceTuning(3, "x")).toEqual({ progress: 0, midi: null, done: false });
		expect(advanceTuning(3, "e")).toEqual({ progress: 1, midi: 40, done: false });
		const { steps } = type("eadxeadgbe");
		expect(steps.at(-1)?.done).toBe(true);
	});
});

describe("registerTap", () => {
	it(`drops the pick on the ${PICK_DROP_TAPS}th press inside the window, then starts counting again`, () => {
		let taps: number[] = [];
		const results = Array.from({ length: PICK_DROP_TAPS }, (_, i) => {
			const r = registerTap(taps, i * 200);
			taps = r.taps;
			return r.dropped;
		});
		expect(results.slice(0, -1).every((d) => !d)).toBe(true);
		expect(results.at(-1)).toBe(true);
		expect(taps).toEqual([]);
	});

	it("forgets presses older than the window", () => {
		const now = 500 + PICK_DROP_WINDOW_MS;
		const r = registerTap([0, 100, 200, 300, 400, 500], now);
		expect(r.dropped).toBe(false);
		expect(r.taps).toEqual([now]);
	});
});

describe("isLateNight", () => {
	it("is midnight to five", () => {
		expect(isLateNight(new Date(2026, 9, 29, 0, 0))).toBe(true);
		expect(isLateNight(new Date(2026, 9, 29, 4, 59))).toBe(true);
		expect(isLateNight(new Date(2026, 9, 29, 5, 0))).toBe(false);
		expect(isLateNight(new Date(2026, 9, 29, 23, 59))).toBe(false);
	});
});

describe("strumFromSweep", () => {
	it("reads a fast sweep down the page as a down strum, up as up", () => {
		expect(strumFromSweep(40, 50)).toBe("down");
		expect(strumFromSweep(-40, 50)).toBe("up");
	});

	it("ignores a short or slow movement", () => {
		expect(strumFromSweep(10, 5)).toBeNull();
		expect(strumFromSweep(40, 400)).toBeNull();
		expect(strumFromSweep(40, 0)).toBeNull();
	});
});
