/**
 * `value` pulled onto the nearest of `points` when it lies within `within` of it, else
 * left where it is — a slider's soft detents (a tempo's 60 / 90 / 120, a mix's 0 dB).
 */
export function snapToPoints(value: number, points: readonly number[], within: number): number {
	let best = value;
	let bestGap = within;
	for (const p of points) {
		const gap = Math.abs(value - p);
		if (gap <= bestGap) {
			best = p;
			bestGap = gap;
		}
	}
	return best;
}

/** Where `value` sits along [min, max], as a percentage (0 when the range is empty). */
export function percentOf(value: number, min: number, max: number): number {
	return max > min ? ((value - min) / (max - min)) * 100 : 0;
}
