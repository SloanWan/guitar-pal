import { describe, expect, it, vi } from "vitest";
import {
	LOGO_CLOSE_MS,
	LOGO_OPEN_MS,
	MARK_PICKS,
	createLogoPlayer,
	gapStrokeWidth,
	logoPose,
	markViewBox,
	springE,
	type PickPose,
} from "../pickMark";

const rotationOf = (pose: PickPose) => Number(pose.transform?.match(/^rotate\((-?[\d.]+)/)?.[1] ?? NaN);

describe("the mark's geometry (spec v1.1 §2)", () => {
	it("frames the five picks in the square viewBox the spec states", () => {
		expect(markViewBox()).toBe("2.81 0.97 26.64 26.64");
	});

	it("fans the hand from one pivot and rests the fifth pick at 74°", () => {
		expect(MARK_PICKS.slice(0, 4).map((p) => p.r)).toEqual([-34, -11, 12, 35]);
		expect(MARK_PICKS.slice(0, 4).every((p) => p.px === 15 && p.py === 16.65 && p.w === 14)).toBe(true);
		expect(MARK_PICKS[4]).toMatchObject({ px: 21.6, py: 20.2, w: 13, r: 74 });
	});

	it("keeps the gap stroke ≈ 1.15 mark units at each pick's own scale", () => {
		expect(gapStrokeWidth(MARK_PICKS[0])).toBeCloseTo(1.97, 2);
		expect(gapStrokeWidth(MARK_PICKS[4])).toBeCloseTo(2.12, 2);
	});
});

describe("springE", () => {
	it("runs from 0 to 1 with a small overshoot and no bounce beyond it", () => {
		expect(springE(0)).toBe(0);
		expect(springE(1)).toBe(1);
		const samples = Array.from({ length: 101 }, (_, i) => springE(i / 100));
		expect(Math.max(...samples)).toBeLessThan(1.03);
		expect(Math.min(...samples.slice(60))).toBeGreaterThan(0.99);
	});
});

describe("logoPose", () => {
	it("t = 0: the hand is closed (every hand pick turned back to 0°) and the fifth pick is hidden", () => {
		const pose = logoPose(0);
		MARK_PICKS.slice(0, 4).forEach((p, j) => expect(rotationOf(pose[j])).toBeCloseTo(-p.r, 1));
		expect(pose[4]).toEqual({ transform: null, opacity: 0 });
	});

	it("t = 300: the first picks are mostly open, the last still turning, the fifth about to start", () => {
		const pose = logoPose(300);
		expect(Math.abs(rotationOf(pose[0]))).toBeLessThan(Math.abs(MARK_PICKS[0].r) * 0.25);
		expect(Math.abs(rotationOf(pose[3]))).toBeGreaterThan(Math.abs(rotationOf(pose[0])));
		expect(pose[4]).toEqual({ transform: null, opacity: 0 });
	});

	it("t = 605: the hand has landed and the fifth pick is in flight, fully opaque", () => {
		const pose = logoPose(605);
		pose.slice(0, 4).forEach((p) => expect(Math.abs(rotationOf(p))).toBeLessThan(0.05));
		expect(pose[4].opacity).toBe(1);
		expect(pose[4].transform).toMatch(/^translate\(/);
	});

	it("t = 780 (and later) is the resting mark", () => {
		for (const t of [LOGO_OPEN_MS, 2000]) expect(logoPose(t).every((p) => p.transform === null && p.opacity === null)).toBe(true);
	});

	it("null — what reduced motion shows — is the resting mark", () => {
		expect(logoPose(null).every((p) => p.transform === null && p.opacity === null)).toBe(true);
	});

	it("the collapse (negative t) fades the fifth pick out as it lifts", () => {
		expect(logoPose(-LOGO_CLOSE_MS)[4].opacity).toBe(1);
		expect(logoPose(-1)[4].opacity).toBeCloseTo(1 / LOGO_CLOSE_MS, 3);
	});
});

/** A fake rAF clock: frames run only when step() is called. */
function fakeFrames() {
	let clock = 0;
	let next = 1;
	const queue = new Map<number, (ts: number) => void>();
	return {
		now: () => clock,
		raf: vi.fn((cb: (ts: number) => void) => {
			const id = next++;
			queue.set(id, cb);
			return id;
		}),
		cancel: vi.fn((id: number) => void queue.delete(id)),
		pending: () => queue.size,
		step(ms: number) {
			clock += ms;
			const due = [...queue];
			queue.clear();
			due.forEach(([, cb]) => cb(clock));
		},
	};
}

describe("createLogoPlayer", () => {
	it("animates on rAF and schedules nothing once the arrival ends", () => {
		const f = fakeFrames();
		const apply = vi.fn();
		const player = createLogoPlayer({ apply, now: f.now, raf: f.raf, cancel: f.cancel, reducedMotion: () => false });
		expect(player.play()).toBe("animated");
		for (let i = 0; i < 60 && f.pending(); i++) f.step(16);
		expect(f.pending()).toBe(0);
		expect(player.isRunning()).toBe(false);
		expect(apply.mock.calls.at(-1)?.[0]).toEqual(logoPose(null));
		const scheduled = f.raf.mock.calls.length;
		f.step(16);
		expect(f.raf.mock.calls.length).toBe(scheduled);
	});

	it("a replay starts from the collapse", () => {
		const f = fakeFrames();
		const apply = vi.fn();
		const player = createLogoPlayer({ apply, now: f.now, raf: f.raf, cancel: f.cancel, reducedMotion: () => false });
		player.play({ collapse: true });
		expect(apply.mock.calls[0][0]).toEqual(logoPose(-LOGO_CLOSE_MS));
	});

	it("stop() — what unmount calls — cancels the pending frame", () => {
		const f = fakeFrames();
		const player = createLogoPlayer({ apply: vi.fn(), now: f.now, raf: f.raf, cancel: f.cancel, reducedMotion: () => false });
		player.play();
		f.step(16);
		expect(f.pending()).toBe(1);
		player.stop();
		expect(f.pending()).toBe(0);
		expect(player.isRunning()).toBe(false);
	});

	it("under reduced motion writes the rest pose and never touches rAF", () => {
		const f = fakeFrames();
		const apply = vi.fn();
		const player = createLogoPlayer({ apply, now: f.now, raf: f.raf, cancel: f.cancel, reducedMotion: () => true });
		expect(player.play()).toBe("reduced");
		expect(apply).toHaveBeenCalledWith(logoPose(null));
		expect(f.raf).not.toHaveBeenCalled();
	});
});

describe("the CSS pick mask", () => {
	it("draws the same outline as PICK_PATH", async () => {
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const { PICK_PATH } = await import("@/lib/brand/pickMark");
		const css = readFileSync(resolve(__dirname, "../../../app/primitives.css"), "utf8");
		expect(css).toContain(`d='${PICK_PATH}'`);
	});
});
