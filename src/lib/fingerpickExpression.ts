/**
 * Pitch-expression curves for the fingerpick audio engine: bend and vibrato.
 *
 * Every tab player we looked at (alphaTab, TuxGuitar, Guitar Pro's MIDI export,
 * webaudiofont) voices a bend or a vibrato as pitch automation on the sample that
 * is already sounding — nobody swaps in a special sample. This module is the pure
 * half of that: it turns a technique plus its parameters into ONE curve of cents
 * over the note's whole duration, sampled uniformly, ready for
 * `AudioParam.setValueCurveAtTime` on the note's own `detune`. Slides keep
 * `playbackRate`; the two params multiply, so a bend on `detune` and a slide ramp
 * on `playbackRate` never fight over one automation timeline.
 *
 * Timing is in milliseconds and never scaled by BPM: a bend takes as long as a
 * finger takes, whatever the tempo. Spreading it over the note reads as a slide
 * at slow tempos, which is the mistake the earlier attempt made.
 *
 * Nothing here touches Web Audio. `/dev/bend-lab` plays these curves so the
 * defaults can be chosen by ear; wiring them into the scheduler is a follow-up.
 */

import type { Technique } from "@/lib/fingerpickTypes";

// ─── Sampling ─────────────────────────────────────────────────────────────────

/**
 * Curve resolution. `detune` is k-rate (one value per 128 frames ≈ 2.9 ms at
 * 44.1 kHz) and `setValueCurveAtTime` interpolates linearly between points, so
 * 1 ms points are already finer than the engine can render — a 7 Hz vibrato
 * gets ~140 points a cycle.
 */
export const CURVE_SAMPLES_PER_SECOND = 1000;

/** Minimum points a curve carries — `setValueCurveAtTime` rejects fewer than two. */
const MIN_CURVE_POINTS = 2;

/** Number of points a curve of `durationS` holds at `samplesPerSecond`. */
export function curveLength(durationS: number, samplesPerSecond: number = CURVE_SAMPLES_PER_SECOND): number {
	return Math.max(MIN_CURVE_POINTS, Math.round(Math.max(0, durationS) * samplesPerSecond) + 1);
}

// ─── Bend ─────────────────────────────────────────────────────────────────────

/**
 * How the pitch travels between the fretted pitch and the bend target.
 *  - `linear`      — straight line (TuxGuitar between bend points)
 *  - `ease-in`     — quadratic: pitch rises slowly first, then fast. This is what
 *                    the string physically does as the finger pushes at a steady
 *                    speed (pitch is roughly quadratic in finger travel)
 *  - `ease-in-out` — smoothstep: a deliberate, "sung" bend
 */
export type BendShape = "linear" | "ease-in" | "ease-in-out";

export interface BendParams {
	/** Bend height in cents above the fretted pitch: quarter 50, half 100, full 200. */
	targetCents: number;
	/** The string is bent before the pluck: the note starts AT the target. */
	preBend: boolean;
	/** Rise time (ms), fixed like a finger's travel; ignored for a pre-bend. */
	riseMs: number;
	riseShape: BendShape;
	/**
	 * Cents the rise goes PAST the target before settling back onto it. Players
	 * often push a hair sharp and let it sit back; 0 = land exactly on the target.
	 */
	overshootCents: number;
	/** Time (ms) to settle from the overshoot back to the target. */
	settleMs: number;
	/** Whether the bend comes back down to the fretted pitch within the note. */
	release: boolean;
	/** Time at the peak before the release starts (ms). See `bendTimeline` for the fit rule. */
	holdMs: number;
	/** Release travel time (ms). */
	releaseMs: number;
	/** Applied to the finger's travel, so `ease-in` on a release drops fast first. */
	releaseShape: BendShape;
}

/** Where a bend's phases fall inside a note, in seconds from the attack. */
export interface BendTimeline {
	/** The pitch reaches the target (plus any overshoot) here; 0 for a pre-bend. */
	peakS: number;
	/** The overshoot has settled onto the target here; equals `peakS` without overshoot. */
	settleEndS: number;
	/** The release starts here; equals `durationS` when there is no release. */
	releaseStartS: number;
	/** The pitch is back at 0 here; equals `durationS` when there is no release. */
	releaseEndS: number;
	durationS: number;
}

/** Unit easing: maps finger travel u ∈ [0, 1] to pitch fraction ∈ [0, 1]. */
export function bendEase(shape: BendShape, u: number): number {
	const t = Math.min(1, Math.max(0, u));
	switch (shape) {
		case "linear":
			return t;
		case "ease-in":
			return t * t;
		case "ease-in-out":
			return t * t * (3 - 2 * t);
	}
}

/**
 * Fit a bend's phases into a note. Rise and release are fixed spans that shrink
 * only when the note is too short to hold them: the rise is clamped to the note,
 * and the release starts after `holdMs` at the peak but is pulled forward so it
 * finishes by the note's end, never earlier than the peak itself.
 */
export function bendTimeline(p: BendParams, durationS: number): BendTimeline {
	const dur = Math.max(0, durationS);
	const peakS = p.preBend ? 0 : Math.min(dur, p.riseMs / 1000);
	let releaseStartS = dur;
	let releaseEndS = dur;
	if (p.release) {
		const wanted = peakS + p.holdMs / 1000;
		const latest = Math.max(peakS, dur - p.releaseMs / 1000);
		releaseStartS = Math.min(wanted, latest);
		releaseEndS = Math.min(dur, releaseStartS + p.releaseMs / 1000);
	}
	const settleEndS = p.overshootCents > 0 ? Math.min(releaseStartS, peakS + p.settleMs / 1000) : peakS;
	return { peakS, settleEndS, releaseStartS, releaseEndS, durationS: dur };
}

/**
 * Cents above the fretted pitch over a note of `durationS`: rise (or start at the
 * target for a pre-bend), hold at the target, and optionally release back to 0.
 */
export function bendCurve(
	p: BendParams,
	durationS: number,
	samplesPerSecond: number = CURVE_SAMPLES_PER_SECOND,
): Float32Array {
	const n = curveLength(durationS, samplesPerSecond);
	const out = new Float32Array(n);
	const { peakS, settleEndS, releaseStartS, releaseEndS } = bendTimeline(p, durationS);
	const releaseLen = releaseEndS - releaseStartS;
	const settleLen = settleEndS - peakS;
	const overshoot = Math.max(0, p.overshootCents);
	const top = p.targetCents + overshoot;
	for (let i = 0; i < n; i++) {
		const t = i / samplesPerSecond;
		let cents: number;
		if (t < peakS) {
			cents = top * bendEase(p.riseShape, t / peakS);
		} else if (t < settleEndS && settleLen > 0) {
			// Sit back from the overshoot onto the target.
			cents = p.targetCents + overshoot * (1 - (t - peakS) / settleLen);
		} else if (!p.release || t <= releaseStartS) {
			cents = p.targetCents;
		} else if (releaseLen <= 0 || t >= releaseEndS) {
			cents = 0;
		} else {
			// The finger travels back at a steady speed; the pitch follows the same
			// travel→pitch mapping as the rise, read backwards.
			cents = p.targetCents * bendEase(p.releaseShape, 1 - (t - releaseStartS) / releaseLen);
		}
		out[i] = cents;
	}
	return out;
}

// ─── Vibrato ──────────────────────────────────────────────────────────────────

/**
 * Shape of one vibrato cycle.
 *  - `sine`     — smooth (alphaTab)
 *  - `triangle` — straight pushes and returns, linear breakpoints
 *  - `square`   — TuxGuitar: the pitch sits at 0 and at +depth, nothing between
 */
export type VibratoWaveform = "sine" | "triangle" | "square";

export interface VibratoParams {
	/** Peak excursion in cents. Slight finger vibrato is 15–35, wide 50–100. */
	depthCents: number;
	rateHz: number;
	/** Silence before the wobble starts (ms) — a real vibrato begins after the pluck settles. */
	onsetMs: number;
	/** Depth grows linearly from 0 over this span after the onset (ms). */
	fadeInMs: number;
	waveform: VibratoWaveform;
	/**
	 * `false` (default): finger vibrato pushes the string, so the pitch swings only
	 * ABOVE the fretted note: 0 → +depth. `true`: ±depth around the note — the
	 * "synth" vibrato MIDI players produce, kept for A/B.
	 */
	symmetric: boolean;
	/** Each cycle's rate is scattered by ±this fraction (0 = metronomic). */
	rateJitter: number;
	/** Seed for the jitter so a curve is reproducible. */
	seed: number;
}

/** Unit waveform over phase φ ∈ [0, 1): starts at 0 and pushes up first, range [-1, 1]. */
export function vibratoWave(waveform: VibratoWaveform, phase: number): number {
	const f = phase - Math.floor(phase);
	switch (waveform) {
		case "sine":
			return Math.sin(2 * Math.PI * f);
		case "triangle":
			// 0 → 1 over the first quarter, 1 → -1 over the middle half, -1 → 0 over the last.
			if (f < 0.25) return f * 4;
			if (f < 0.75) return 1 - (f - 0.25) * 4;
			return -1 + (f - 0.75) * 4;
		case "square":
			return f < 0.5 ? 1 : -1;
	}
}

/** Small deterministic PRNG (mulberry32) so a jittered curve is reproducible. */
export function seededRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Cents over a span of `durationS`: silence for `onsetMs`, then the waveform at
 * `rateHz`, its depth fading in over `fadeInMs`. Asymmetric by default (0 → +depth).
 */
export function vibratoCurve(
	p: VibratoParams,
	durationS: number,
	samplesPerSecond: number = CURVE_SAMPLES_PER_SECOND,
): Float32Array {
	const n = curveLength(durationS, samplesPerSecond);
	const out = new Float32Array(n);
	const onsetS = p.onsetMs / 1000;
	const fadeS = p.fadeInMs / 1000;
	const dt = 1 / samplesPerSecond;
	const rand = seededRandom(p.seed);
	const jitter = Math.max(0, p.rateJitter);
	const nextRate = () => p.rateHz * (1 + jitter * (2 * rand() - 1));

	let phase = 0;
	let cycleRate = nextRate();
	for (let i = 0; i < n; i++) {
		const t = i / samplesPerSecond;
		if (t < onsetS) {
			out[i] = 0;
			continue;
		}
		const wave = vibratoWave(p.waveform, phase);
		const unit = p.symmetric ? wave : (wave + 1) / 2;
		const envelope = fadeS > 0 ? Math.min(1, (t - onsetS) / fadeS) : 1;
		out[i] = p.depthCents * unit * envelope;

		phase += cycleRate * dt;
		if (phase >= 1) {
			phase -= Math.floor(phase);
			cycleRate = nextRate();
		}
	}
	return out;
}

// ─── Composition ─────────────────────────────────────────────────────────────

export interface ExpressionSpec {
	bend?: BendParams;
	/**
	 * With a bend, the vibrato rides on the bend's peak (its onset counts from the
	 * moment the target is reached) and stops when the release starts.
	 */
	vibrato?: VibratoParams;
}

/** One note's expression, ready for `detune.setValueCurveAtTime(values, startTime, duration)`. */
export interface ExpressionCurve {
	values: Float32Array;
	/** Seconds after the attack the curve starts — always 0: the curve covers the whole note. */
	startTime: number;
	duration: number;
	samplesPerSecond: number;
}

/**
 * Build the whole note's detune curve: bend + vibrato summed onto one timeline.
 * A vibrato without a bend runs from the attack; with one, it sits on the peak.
 */
export function composeExpression(
	spec: ExpressionSpec,
	durationS: number,
	samplesPerSecond: number = CURVE_SAMPLES_PER_SECOND,
): ExpressionCurve {
	const n = curveLength(durationS, samplesPerSecond);
	const values = spec.bend
		? bendCurve(spec.bend, durationS, samplesPerSecond)
		: new Float32Array(n);

	if (spec.vibrato) {
		const window = spec.bend
			? bendTimeline(spec.bend, durationS)
			: { peakS: 0, releaseStartS: Math.max(0, durationS) };
		const span = window.releaseStartS - window.peakS;
		if (span > 0) {
			const offset = Math.round(window.peakS * samplesPerSecond);
			const vib = vibratoCurve(spec.vibrato, span, samplesPerSecond);
			const last = Math.min(n, offset + vib.length);
			for (let i = offset; i < last; i++) values[i] += vib[i - offset];
		}
	}

	return { values, startTime: 0, duration: Math.max(0, durationS), samplesPerSecond };
}

// ─── Defaults and technique mapping ──────────────────────────────────────────

/** Bend defaults (a full bend). See `/dev/bend-lab` for how these were chosen. */
export const DEFAULT_BEND_PARAMS: BendParams = {
	targetCents: 200,
	preBend: false,
	riseMs: 150,
	riseShape: "ease-in",
	overshootCents: 0,
	settleMs: 120,
	release: false,
	holdMs: 200,
	releaseMs: 150,
	releaseShape: "ease-in",
};

/** Finger vibrato: asymmetric, slight, a little late and a little uneven. */
export const DEFAULT_VIBRATO_PARAMS: VibratoParams = {
	depthCents: 30,
	rateHz: 5.5,
	onsetMs: 150,
	fadeInMs: 200,
	waveform: "sine",
	symmetric: false,
	rateJitter: 0.08,
	seed: 1,
};

/** Wide vibrato: deeper and a touch slower, otherwise the same hand. */
export const WIDE_VIBRATO_PARAMS: VibratoParams = {
	...DEFAULT_VIBRATO_PARAMS,
	depthCents: 80,
	rateHz: 5,
};

/** Bend heights by name, in cents. */
export const BEND_TARGET_CENTS = {
	quarter: 50,
	half: 100,
	full: 200,
} as const;

/** Bend height for a `bendTarget` in semitones (the `StringFret` field), default a full bend. */
export function bendTargetToCents(semitones: number | undefined): number {
	if (semitones === undefined || !Number.isFinite(semitones) || semitones <= 0) {
		return BEND_TARGET_CENTS.full;
	}
	return semitones * 100;
}

/**
 * The expression a technique asks for, or null when it has none. Bend techniques
 * that carry their height in the name ignore `bendTarget`; the release variants
 * read it (a released bend can be any height).
 */
export function expressionForTechnique(
	technique: Technique,
	bendTarget?: number,
	defaults: { bend: BendParams; vibrato: VibratoParams; wideVibrato: VibratoParams } = {
		bend: DEFAULT_BEND_PARAMS,
		vibrato: DEFAULT_VIBRATO_PARAMS,
		wideVibrato: WIDE_VIBRATO_PARAMS,
	},
): ExpressionSpec | null {
	const bend = (over: Partial<BendParams>): ExpressionSpec => ({ bend: { ...defaults.bend, ...over } });
	switch (technique) {
		case "bend-quarter":
			return bend({ targetCents: BEND_TARGET_CENTS.quarter, preBend: false, release: false });
		case "bend-half":
			return bend({ targetCents: BEND_TARGET_CENTS.half, preBend: false, release: false });
		case "bend-full":
			return bend({ targetCents: BEND_TARGET_CENTS.full, preBend: false, release: false });
		case "bend-release":
			return bend({ targetCents: bendTargetToCents(bendTarget), preBend: false, release: true });
		case "pre-bend":
			return bend({ targetCents: bendTargetToCents(bendTarget), preBend: true, release: false });
		case "pre-bend-release":
			return bend({ targetCents: bendTargetToCents(bendTarget), preBend: true, release: true });
		case "vibrato":
			return { vibrato: defaults.vibrato };
		case "vibrato-wide":
			return { vibrato: defaults.wideVibrato };
		default:
			return null;
	}
}
