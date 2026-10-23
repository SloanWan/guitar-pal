/** Bounds and grain of a stepped number (a tempo, a capo fret, a count). */
export interface StepRange {
	min: number;
	max: number;
	step: number;
}

const decimals = (n: number): number => (String(n).split(".")[1] ?? "").length;

/** `value` clamped into the range and snapped to the step grid (counted from `min`). */
export function clampToRange(value: number, { min, max, step }: StepRange): number {
	const snapped = min + Math.round((value - min) / step) * step;
	const clamped = Math.min(max, Math.max(min, snapped));
	return Number(clamped.toFixed(Math.max(decimals(step), decimals(min))));
}

/** One step from `value` in `direction` (+1 up, -1 down), held inside the range. */
export function stepValue(value: number, direction: 1 | -1, range: StepRange): number {
	return clampToRange(value + direction * range.step, range);
}

/** A gap longer than this between taps starts a new count. */
export const TAP_RESET_MS = 2000;
/** How many of the latest intervals the tempo averages. */
export const TAP_WINDOW = 4;

/**
 * Adds a tap (ms timestamp) to the run: a pause longer than TAP_RESET_MS starts a new
 * run, and only the taps the window needs are kept.
 */
export function pushTap(taps: readonly number[], at: number): number[] {
	const last = taps[taps.length - 1];
	const run = last !== undefined && at - last <= TAP_RESET_MS ? [...taps, at] : [at];
	return run.slice(-(TAP_WINDOW + 1));
}

/** Beats per minute from a run of taps — the mean of its intervals — or null under two taps. */
export function tapTempo(taps: readonly number[]): number | null {
	if (taps.length < 2) return null;
	const span = taps[taps.length - 1] - taps[0];
	if (span <= 0) return null;
	return (60_000 * (taps.length - 1)) / span;
}
