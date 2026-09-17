import { computeLoopOffset, type MeasureBoundary } from "./fingerpickScheduler";

/**
 * Loop a stretch of the pattern instead of the whole of it.
 *
 * A "pass" is what the engine schedules and repeats. Without a region a pass
 * is the whole pattern, and every formula here reduces to the plain
 * whole-pattern arithmetic the engine has always used. With a region a pass is
 * the measures `[startMeasure, endMeasure]`, but every time the engine hands
 * out — progress, pause position, seek target — stays on the **pattern
 * timeline** (seconds from the pattern's start), so the playhead and the
 * event list never need to know a region exists. Only the conversion between
 * pattern time and pass time happens here.
 */

/** The measures a loop covers, inclusive, on the expanded (playback) timeline. */
export interface LoopRegion {
	startMeasure: number;
	endMeasure: number;
}

/** The stretch of pattern time one pass plays: `[start, end)` in seconds. */
export interface PassBounds {
	start: number;
	end: number;
}

/** A pass over the whole pattern. */
export function wholePattern(patternDuration: number): PassBounds {
	return { start: 0, end: patternDuration };
}

/**
 * The seconds a region covers: from its first measure's start to the start of
 * the measure after its last (or the pattern's end). Measure indices outside
 * the pattern are clamped; a reversed pair is swapped. No region, or no
 * measures to bound, means the whole pattern.
 */
export function regionBounds(
	boundaries: readonly MeasureBoundary[],
	patternDuration: number,
	region: LoopRegion | null,
): PassBounds {
	if (!region || boundaries.length === 0) return wholePattern(patternDuration);
	const last = boundaries.length - 1;
	const clamp = (i: number) => Math.min(last, Math.max(0, Math.floor(i)));
	let a = clamp(region.startMeasure);
	let b = clamp(region.endMeasure);
	if (b < a) [a, b] = [b, a];
	const start = boundaries[a].startTime;
	const end = b + 1 <= last ? boundaries[b + 1].startTime : patternDuration;
	return { start, end };
}

/** How long one pass plays, before any loop gap. */
export function passLength(bounds: PassBounds): number {
	return bounds.end - bounds.start;
}

/** Pass time (seconds into the pass) of a pattern time. */
export function toPassTime(t: number, bounds: PassBounds): number {
	return t - bounds.start;
}

/**
 * Whether a pattern time is played by a pass that starts at `from` (pattern
 * seconds): inside the bounds and not before `from`.
 */
export function inPass(t: number, bounds: PassBounds, from: number): boolean {
	return t >= from && t >= bounds.start && t < bounds.end;
}

/** A pattern time inside the pass stays; anything outside starts the pass over. */
export function clampToBounds(t: number, bounds: PassBounds): number {
	return t >= bounds.start && t < bounds.end ? t : bounds.start;
}

/**
 * Where playback stands `totalElapsed` seconds after pass 0 began: which pass,
 * and the pattern time. During a loop gap `elapsed` runs past `bounds.end`,
 * exactly as it used to run past the pattern's end.
 */
export function locateInPass(
	totalElapsed: number,
	bounds: PassBounds,
	loopGapSeconds: number,
): { passIndex: number; elapsed: number } {
	const passDuration = passLength(bounds) + loopGapSeconds;
	const passIndex = passDuration > 0 ? Math.floor(totalElapsed / passDuration) : 0;
	const elapsed = bounds.start + (totalElapsed - passIndex * passDuration);
	return { passIndex, elapsed };
}

/**
 * Seconds after pass 0 began at which pattern time `t` of pass `passIndex`
 * plays — the inverse of `locateInPass`.
 */
export function timelineOffset(
	passIndex: number,
	bounds: PassBounds,
	loopGapSeconds: number,
	t: number,
): number {
	return computeLoopOffset(passIndex, passLength(bounds), loopGapSeconds) + toPassTime(t, bounds);
}

/**
 * The expanded measures a selection of rendered measures should loop.
 *
 * `originMeasureIndices[i]` is the rendered measure that expanded measure `i`
 * plays. A repeat makes a rendered measure appear more than once, so the
 * selection is mapped to the first contiguous run of expanded measures that
 * lies entirely inside it and holds both its ends: a section that contains a
 * whole repeat plays the repeat; one that cuts into a repeat plays its first
 * occurrence only. With no such run (nothing rendered, or the indices are
 * stale) the ends map to their first occurrences.
 */
export function regionForSelection(
	originMeasureIndices: readonly number[],
	selection: { startMeasure: number; endMeasure: number },
): LoopRegion {
	const s = Math.min(selection.startMeasure, selection.endMeasure);
	const e = Math.max(selection.startMeasure, selection.endMeasure);
	const inside = (i: number) => {
		const origin = originMeasureIndices[i];
		return origin >= s && origin <= e;
	};
	let i = 0;
	while (i < originMeasureIndices.length) {
		if (!inside(i)) {
			i++;
			continue;
		}
		const runStart = i;
		while (i < originMeasureIndices.length && inside(i)) i++;
		const runEnd = i - 1;
		let first = -1;
		let last = -1;
		for (let j = runStart; j <= runEnd; j++) {
			if (first === -1 && originMeasureIndices[j] === s) first = j;
			if (originMeasureIndices[j] === e) last = j;
		}
		if (first !== -1 && last !== -1 && last >= first) {
			return { startMeasure: first, endMeasure: last };
		}
	}
	const firstOf = (m: number) => {
		const idx = originMeasureIndices.indexOf(m);
		return idx === -1 ? m : idx;
	};
	const a = firstOf(s);
	const b = firstOf(e);
	return { startMeasure: Math.min(a, b), endMeasure: Math.max(a, b) };
}
