import { describe, it, expect } from "vitest";

import {
	CURVE_SAMPLES_PER_SECOND,
	curveLength,
	bendEase,
	bendTimeline,
	bendCurve,
	vibratoWave,
	vibratoCurve,
	seededRandom,
	composeExpression,
	expressionForTechnique,
	bendTargetToCents,
	DEFAULT_BEND_PARAMS,
	DEFAULT_VIBRATO_PARAMS,
	WIDE_VIBRATO_PARAMS,
	BEND_TARGET_CENTS,
	type BendParams,
	type VibratoParams,
} from "@/lib/fingerpickExpression";

const SPS = CURVE_SAMPLES_PER_SECOND;

const fullBend: BendParams = { ...DEFAULT_BEND_PARAMS, targetCents: 200, riseMs: 150, riseShape: "linear" };

const vib: VibratoParams = {
	...DEFAULT_VIBRATO_PARAMS,
	depthCents: 40,
	rateHz: 5,
	onsetMs: 0,
	fadeInMs: 0,
	rateJitter: 0,
};

function at(values: Float32Array, seconds: number): number {
	return values[Math.round(seconds * SPS)];
}

function max(values: Float32Array): number {
	let m = -Infinity;
	for (const v of values) m = Math.max(m, v);
	return m;
}

function min(values: Float32Array): number {
	let m = Infinity;
	for (const v of values) m = Math.min(m, v);
	return m;
}

function isNonDecreasing(values: Float32Array, from: number, to: number): boolean {
	for (let i = from + 1; i <= to; i++) if (values[i] < values[i - 1] - 1e-6) return false;
	return true;
}

describe("curveLength", () => {
	it("holds one point per sample plus the endpoint", () => {
		expect(curveLength(1)).toBe(SPS + 1);
		expect(curveLength(0.5, 100)).toBe(51);
	});

	it("never drops below the two points setValueCurveAtTime needs", () => {
		expect(curveLength(0)).toBe(2);
		expect(curveLength(-1)).toBe(2);
	});
});

describe("bendEase", () => {
	it("all shapes pin both ends and clamp outside [0, 1]", () => {
		for (const shape of ["linear", "ease-in", "ease-in-out"] as const) {
			expect(bendEase(shape, 0)).toBe(0);
			expect(bendEase(shape, 1)).toBe(1);
			expect(bendEase(shape, -3)).toBe(0);
			expect(bendEase(shape, 7)).toBe(1);
		}
	});

	it("ease-in lags the straight line, ease-in-out crosses it at the middle", () => {
		expect(bendEase("ease-in", 0.5)).toBeLessThan(bendEase("linear", 0.5));
		expect(bendEase("ease-in", 0.5)).toBe(0.25);
		expect(bendEase("ease-in-out", 0.5)).toBeCloseTo(0.5);
		expect(bendEase("ease-in-out", 0.25)).toBeLessThan(0.25);
		expect(bendEase("ease-in-out", 0.75)).toBeGreaterThan(0.75);
	});
});

describe("bendTimeline", () => {
	it("a plain bend peaks after the rise and never releases", () => {
		expect(bendTimeline(fullBend, 1)).toEqual({ peakS: 0.15, settleEndS: 0.15, releaseStartS: 1, releaseEndS: 1, durationS: 1 });
	});

	it("a pre-bend peaks at the attack", () => {
		expect(bendTimeline({ ...fullBend, preBend: true }, 1).peakS).toBe(0);
	});

	it("the rise is clamped to a note shorter than it", () => {
		expect(bendTimeline(fullBend, 0.1).peakS).toBe(0.1);
	});

	it("a release starts after the hold when the note has room", () => {
		const tl = bendTimeline({ ...fullBend, release: true, holdMs: 200, releaseMs: 150 }, 1);
		expect(tl.releaseStartS).toBeCloseTo(0.35);
		expect(tl.releaseEndS).toBeCloseTo(0.5);
	});

	it("a release is pulled forward so it finishes by the note's end", () => {
		const tl = bendTimeline({ ...fullBend, release: true, holdMs: 800, releaseMs: 150 }, 1);
		expect(tl.releaseStartS).toBeCloseTo(0.85);
		expect(tl.releaseEndS).toBeCloseTo(1);
	});

	it("a release never starts before the peak, even on a tiny note", () => {
		const tl = bendTimeline({ ...fullBend, release: true, holdMs: 0, releaseMs: 500 }, 0.1);
		expect(tl.peakS).toBe(0.1);
		expect(tl.releaseStartS).toBe(0.1);
		expect(tl.releaseEndS).toBe(0.1);
	});
});

describe("bendCurve", () => {
	it("rises monotonically from 0 to the target, then holds", () => {
		const c = bendCurve(fullBend, 1);
		expect(c.length).toBe(SPS + 1);
		expect(c[0]).toBe(0);
		expect(at(c, 0.15)).toBeCloseTo(200);
		expect(isNonDecreasing(c, 0, Math.round(0.15 * SPS))).toBe(true);
		expect(at(c, 0.5)).toBe(200);
		expect(c[c.length - 1]).toBe(200);
		expect(max(c)).toBeLessThanOrEqual(200);
		expect(min(c)).toBeGreaterThanOrEqual(0);
	});

	it("linear and ease-in share endpoints but ease-in is lower mid-rise", () => {
		const lin = bendCurve(fullBend, 1);
		const ease = bendCurve({ ...fullBend, riseShape: "ease-in" }, 1);
		expect(at(lin, 0.075)).toBeCloseTo(100);
		expect(at(ease, 0.075)).toBeCloseTo(50);
		expect(at(ease, 0.15)).toBeCloseTo(200);
	});

	it("a pre-bend starts at the target", () => {
		const c = bendCurve({ ...fullBend, preBend: true }, 1);
		expect(c[0]).toBe(200);
		expect(min(c)).toBe(200);
	});

	it("a release comes back to 0 by the end of the note", () => {
		const c = bendCurve({ ...fullBend, release: true, holdMs: 200, releaseMs: 150 }, 1);
		expect(at(c, 0.3)).toBe(200);
		expect(at(c, 0.35)).toBeCloseTo(200);
		expect(at(c, 0.5)).toBeCloseTo(0);
		expect(at(c, 0.75)).toBe(0);
		expect(c[c.length - 1]).toBe(0);
		// Between release start and end the pitch only falls.
		const from = Math.round(0.35 * SPS);
		const to = Math.round(0.5 * SPS);
		for (let i = from + 1; i <= to; i++) expect(c[i]).toBeLessThanOrEqual(c[i - 1] + 1e-6);
	});

	it("an ease-in release drops fast first (same travel→pitch mapping read backwards)", () => {
		const p = { ...fullBend, release: true, holdMs: 200, releaseMs: 200, releaseShape: "ease-in" as const };
		const c = bendCurve(p, 1);
		// Half-way through the release the finger is half-way back: (0.5)^2 of the target.
		expect(at(c, 0.45)).toBeCloseTo(50, 0);
	});

	it("a pre-bend-release starts at the target and ends at 0", () => {
		const c = bendCurve({ ...fullBend, preBend: true, release: true, holdMs: 100, releaseMs: 100 }, 0.5);
		expect(c[0]).toBe(200);
		expect(at(c, 0.1)).toBe(200);
		expect(c[c.length - 1]).toBe(0);
	});

	it("an overshoot goes past the target and settles back onto it", () => {
		const p = { ...fullBend, overshootCents: 20, settleMs: 100 };
		const tl = bendTimeline(p, 1);
		expect(tl.peakS).toBeCloseTo(0.15);
		expect(tl.settleEndS).toBeCloseTo(0.25);
		const c = bendCurve(p, 1);
		expect(at(c, 0.15)).toBeCloseTo(220);
		expect(at(c, 0.2)).toBeCloseTo(210);
		expect(at(c, 0.25)).toBeCloseTo(200);
		expect(at(c, 0.6)).toBe(200);
		expect(max(c)).toBeLessThanOrEqual(220 + 1e-6);
		// Half-way up the rise the curve heads for the overshoot, not the target.
		expect(at(c, 0.075)).toBeCloseTo(110);
	});

	it("an overshoot settles before the release and the release still ends at 0", () => {
		const p = { ...fullBend, overshootCents: 30, settleMs: 500, release: true, holdMs: 100, releaseMs: 100 };
		const tl = bendTimeline(p, 1);
		expect(tl.releaseStartS).toBeCloseTo(0.25);
		expect(tl.settleEndS).toBeCloseTo(0.25);
		const c = bendCurve(p, 1);
		expect(at(c, 0.15)).toBeCloseTo(230);
		expect(at(c, 0.25)).toBeCloseTo(200);
		expect(at(c, 0.35)).toBeCloseTo(0);
	});

	it("a pre-bend with overshoot starts above the target and settles", () => {
		const c = bendCurve({ ...fullBend, preBend: true, overshootCents: 20, settleMs: 100 }, 1);
		expect(c[0]).toBeCloseTo(220);
		expect(at(c, 0.1)).toBeCloseTo(200);
	});

	it("timing is in milliseconds regardless of how long the note is", () => {
		const short = bendCurve(fullBend, 0.5);
		const long = bendCurve(fullBend, 2);
		expect(at(short, 0.075)).toBeCloseTo(at(long, 0.075));
		expect(at(short, 0.15)).toBeCloseTo(200);
		expect(at(long, 0.15)).toBeCloseTo(200);
	});
});

describe("vibratoWave", () => {
	it("every waveform starts at 0 or pushes up first and stays within ±1", () => {
		for (const w of ["sine", "triangle", "square"] as const) {
			for (let f = 0; f < 1; f += 0.01) {
				const v = vibratoWave(w, f);
				expect(v).toBeGreaterThanOrEqual(-1);
				expect(v).toBeLessThanOrEqual(1);
			}
			expect(vibratoWave(w, 0.25)).toBeCloseTo(1);
			expect(vibratoWave(w, 0.75)).toBeCloseTo(-1);
		}
		expect(vibratoWave("sine", 0)).toBe(0);
		expect(vibratoWave("triangle", 0)).toBe(0);
		expect(vibratoWave("triangle", 0.5)).toBeCloseTo(0);
	});

	it("wraps the phase", () => {
		expect(vibratoWave("sine", 1.25)).toBeCloseTo(vibratoWave("sine", 0.25));
		expect(vibratoWave("triangle", 3.1)).toBeCloseTo(vibratoWave("triangle", 0.1));
	});
});

describe("seededRandom", () => {
	it("is deterministic for a seed and in [0, 1)", () => {
		const a = seededRandom(42);
		const b = seededRandom(42);
		for (let i = 0; i < 20; i++) {
			const v = a();
			expect(v).toBe(b());
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
		expect(seededRandom(1)()).not.toBe(seededRandom(2)());
	});
});

describe("vibratoCurve", () => {
	it("asymmetric: swings only above the fretted pitch, up to the depth", () => {
		const c = vibratoCurve(vib, 1);
		expect(c.length).toBe(SPS + 1);
		expect(min(c)).toBeGreaterThanOrEqual(0);
		expect(max(c)).toBeCloseTo(40, 0);
		expect(c[0]).toBeCloseTo(20); // (sin 0 + 1) / 2 of the depth
	});

	it("symmetric: ±depth around the fretted pitch", () => {
		const c = vibratoCurve({ ...vib, symmetric: true }, 1);
		expect(min(c)).toBeCloseTo(-40, 0);
		expect(max(c)).toBeCloseTo(40, 0);
		expect(c[0]).toBe(0);
	});

	it("is silent before the onset and fades in from 0 afterwards", () => {
		const c = vibratoCurve({ ...vib, onsetMs: 200, fadeInMs: 400 }, 1);
		expect(at(c, 0)).toBe(0);
		expect(at(c, 0.199)).toBe(0);
		expect(at(c, 0.2)).toBe(0);
		// A quarter of the way through the fade-in the envelope is 0.25.
		const peakInFade = Math.max(...Array.from(c.slice(Math.round(0.2 * SPS), Math.round(0.4 * SPS))));
		expect(peakInFade).toBeLessThan(40 * 0.5 + 1e-6);
		const peakAfter = Math.max(...Array.from(c.slice(Math.round(0.6 * SPS))));
		expect(peakAfter).toBeCloseTo(40, 0);
	});

	it("runs at the requested rate: one peak per cycle", () => {
		const c = vibratoCurve({ ...vib, rateHz: 6 }, 2);
		let peaks = 0;
		for (let i = 1; i < c.length - 1; i++) {
			if (c[i] > c[i - 1] && c[i] >= c[i + 1] && c[i] > 30) peaks++;
		}
		expect(peaks).toBe(12);
	});

	it("without jitter equals a metronomic wave; with jitter it is reproducible by seed", () => {
		const plain = vibratoCurve(vib, 1);
		const noJitter = vibratoCurve({ ...vib, rateJitter: 0, seed: 99 }, 1);
		expect(Array.from(noJitter)).toEqual(Array.from(plain));

		const j1 = vibratoCurve({ ...vib, rateJitter: 0.2, seed: 7 }, 1);
		const j2 = vibratoCurve({ ...vib, rateJitter: 0.2, seed: 7 }, 1);
		const j3 = vibratoCurve({ ...vib, rateJitter: 0.2, seed: 8 }, 1);
		expect(Array.from(j1)).toEqual(Array.from(j2));
		expect(Array.from(j1)).not.toEqual(Array.from(j3));
		expect(Array.from(j1)).not.toEqual(Array.from(plain));
		expect(max(j1)).toBeLessThanOrEqual(40 + 1e-6);
		expect(min(j1)).toBeGreaterThanOrEqual(0);
	});

	it("a square wave sits at 0 and at the depth, nothing between (TuxGuitar)", () => {
		const c = vibratoCurve({ ...vib, waveform: "square" }, 1);
		for (const v of c) expect(v === 0 || Math.abs(v - 40) < 1e-6).toBe(true);
	});
});

describe("composeExpression", () => {
	it("a vibrato alone runs from the attack over the whole note", () => {
		const { values, startTime, duration } = composeExpression({ vibrato: vib }, 1);
		expect(startTime).toBe(0);
		expect(duration).toBe(1);
		expect(Array.from(values)).toEqual(Array.from(vibratoCurve(vib, 1)));
	});

	it("a bend alone is the bend curve", () => {
		const { values } = composeExpression({ bend: fullBend }, 1);
		expect(Array.from(values)).toEqual(Array.from(bendCurve(fullBend, 1)));
	});

	it("nothing to express is a flat 0 line", () => {
		const { values } = composeExpression({}, 0.5);
		expect(values.length).toBe(curveLength(0.5));
		expect(max(values)).toBe(0);
		expect(min(values)).toBe(0);
	});

	it("bend + vibrato: the vibrato rides on the peak, offset by the rise", () => {
		const spec = { bend: fullBend, vibrato: { ...vib, onsetMs: 100 } };
		const { values } = composeExpression(spec, 1);
		// During the rise there is no vibrato.
		expect(at(values, 0.075)).toBeCloseTo(100);
		// 150 ms rise + 100 ms onset: still flat at the target.
		expect(at(values, 0.2)).toBeCloseTo(200);
		// After the onset the wobble adds on top of the target.
		const tail = values.slice(Math.round(0.3 * SPS));
		expect(max(tail)).toBeCloseTo(240, 0);
		expect(min(tail)).toBeGreaterThanOrEqual(200 - 1e-3);
	});

	it("bend-release + vibrato: the vibrato stops when the release starts", () => {
		const bend = { ...fullBend, release: true, holdMs: 400, releaseMs: 150 };
		const { values } = composeExpression({ bend, vibrato: vib }, 1);
		const release = bendTimeline(bend, 1).releaseStartS;
		expect(release).toBeCloseTo(0.55);
		// Release start onward matches the bare bend curve (no wobble).
		const bare = bendCurve(bend, 1);
		for (let i = Math.round(release * SPS) + 1; i < values.length; i++) {
			expect(values[i]).toBeCloseTo(bare[i], 5);
		}
		expect(values[values.length - 1]).toBe(0);
	});

	it("keeps the curve the note's length whatever the layering", () => {
		const long = composeExpression({ bend: { ...fullBend, preBend: true }, vibrato: vib }, 0.25);
		expect(long.values.length).toBe(curveLength(0.25));
	});
});

describe("bendTargetToCents", () => {
	it("reads semitones, defaulting to a full bend", () => {
		expect(bendTargetToCents(2)).toBe(200);
		expect(bendTargetToCents(1)).toBe(100);
		expect(bendTargetToCents(0.5)).toBe(50);
		expect(bendTargetToCents(undefined)).toBe(BEND_TARGET_CENTS.full);
		expect(bendTargetToCents(0)).toBe(BEND_TARGET_CENTS.full);
		expect(bendTargetToCents(NaN)).toBe(BEND_TARGET_CENTS.full);
	});
});

describe("expressionForTechnique", () => {
	it("named bends carry their height and ignore bendTarget", () => {
		expect(expressionForTechnique("bend-quarter", 2)?.bend?.targetCents).toBe(50);
		expect(expressionForTechnique("bend-half")?.bend?.targetCents).toBe(100);
		expect(expressionForTechnique("bend-full", 0.5)?.bend?.targetCents).toBe(200);
		expect(expressionForTechnique("bend-full")?.bend?.release).toBe(false);
		expect(expressionForTechnique("bend-full")?.bend?.preBend).toBe(false);
		expect(expressionForTechnique("bend-full")?.vibrato).toBeUndefined();
	});

	it("release and pre-bend variants read bendTarget", () => {
		const rel = expressionForTechnique("bend-release", 1)?.bend;
		expect(rel).toMatchObject({ targetCents: 100, preBend: false, release: true });
		const pre = expressionForTechnique("pre-bend", 0.5)?.bend;
		expect(pre).toMatchObject({ targetCents: 50, preBend: true, release: false });
		const preRel = expressionForTechnique("pre-bend-release")?.bend;
		expect(preRel).toMatchObject({ targetCents: 200, preBend: true, release: true });
	});

	it("vibrato techniques map to the vibrato defaults", () => {
		expect(expressionForTechnique("vibrato")).toEqual({ vibrato: DEFAULT_VIBRATO_PARAMS });
		expect(expressionForTechnique("vibrato-wide")).toEqual({ vibrato: WIDE_VIBRATO_PARAMS });
	});

	it("other techniques have no expression", () => {
		for (const t of [null, "hammer-on", "slide-up", "vibrato-bar", "trill", "tapping"] as const) {
			expect(expressionForTechnique(t)).toBeNull();
		}
	});

	it("keeps the caller's tuned parameters when handed as defaults", () => {
		const bend = { ...DEFAULT_BEND_PARAMS, riseMs: 90, riseShape: "linear" as const };
		const spec = expressionForTechnique("bend-half", undefined, {
			bend,
			vibrato: DEFAULT_VIBRATO_PARAMS,
			wideVibrato: WIDE_VIBRATO_PARAMS,
		});
		expect(spec?.bend).toMatchObject({ targetCents: 100, riseMs: 90, riseShape: "linear" });
	});
});
