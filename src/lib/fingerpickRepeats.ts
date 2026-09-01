import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import type { RepeatDirective } from "@/lib/tabImport/types";
import { expandRepeats, MAX_REPEAT_TIMES } from "@/lib/tabImport/expandRepeats";

/** Total plays for a repeat when no explicit count is set (one loop-back). */
export const DEFAULT_REPEAT_TIMES = 2;

export interface DerivedRepeats {
	/** Non-overlapping, in-bounds ranges — exactly `expandRepeats`'s input contract. */
	directives: RepeatDirective[];
	/** First validation error (human-readable), or null if the repeat markup is sound. */
	error: string | null;
}

/** Clamp an authored play-count to the valid [DEFAULT, MAX] integer range. */
function clampTimes(times: number | undefined): number {
	const n = Math.floor(times ?? DEFAULT_REPEAT_TIMES);
	if (!Number.isFinite(n) || n < DEFAULT_REPEAT_TIMES) return DEFAULT_REPEAT_TIMES;
	return Math.min(n, MAX_REPEAT_TIMES);
}

/**
 * Convert per-measure `repeatStart` / `repeatEnd` / `repeatTimes` flags into
 * `RepeatDirective` ranges, validating as it sweeps left-to-right.
 *
 * Rules (nesting is unsupported — repeats are flat, non-overlapping):
 *  - `repeatStart` opens a range; opening while one is already open is an error.
 *  - `repeatEnd` closes the open range `[start, i]` with `times = repeatTimes ?? 2`;
 *    an end with no open start is an error.
 *  - A measure carrying BOTH flags is a single-measure repeat `[i, i]` (start is
 *    processed before end within the same measure).
 *  - A range left open at the end of the pattern is an error.
 *
 * Returns the directives collected before any error (callers block on `error`).
 */
export function deriveRepeatDirectives(measures: Measure[]): DerivedRepeats {
	const directives: RepeatDirective[] = [];
	let openStart: number | null = null;

	for (let i = 0; i < measures.length; i++) {
		const m = measures[i];
		if (m.repeatStart) {
			if (openStart !== null) {
				return {
					directives,
					error: `Measure ${i + 1}: repeat start inside an open repeat (nested repeats are not supported).`,
				};
			}
			openStart = i;
		}
		if (m.repeatEnd) {
			if (openStart === null) {
				return {
					directives,
					error: `Measure ${i + 1}: repeat end without a matching start.`,
				};
			}
			directives.push({ range: [openStart, i], times: clampTimes(m.repeatTimes) });
			openStart = null;
		}
	}

	if (openStart !== null) {
		return {
			directives,
			error: `Measure ${openStart + 1}: repeat start without a matching end.`,
		};
	}

	return { directives, error: null };
}

export interface ExpandedPattern {
	/** The pattern with repeated measures flattened for scheduling. */
	pattern: FingerpickPattern;
	/**
	 * `originMeasureIndices[expandedIndex]` = the ORIGINAL authored measure index that the
	 * expanded measure came from. Lets the playback cursor map an expanded position back to
	 * the single rendered stave. Purely structural (independent of the fresh clone IDs
	 * `expandRepeats` mints), so it is stable across recomputes.
	 */
	originMeasureIndices: number[];
}

/**
 * Build the expanded→original index map by replaying the SAME back-to-front insertion
 * `expandRepeats` performs, on a parallel array of original indices. Kept in lockstep with
 * `expandRepeats` (byDesc order, slice, `times - 1` copies, splice after `end`); a unit test
 * asserts the length matches `expandRepeats`'s output to catch any future drift.
 */
function expandOriginIndices(measureCount: number, directives: RepeatDirective[]): number[] {
	const origin: number[] = [];
	for (let i = 0; i < measureCount; i++) origin.push(i);

	const byDesc = [...directives].sort((a, b) => b.range[0] - a.range[0]);
	for (const d of byDesc) {
		const [start, end] = d.range;
		const segment = origin.slice(start, end + 1);
		const copies: number[] = [];
		for (let i = 1; i < d.times; i++) {
			copies.push(...segment);
		}
		origin.splice(end + 1, 0, ...copies);
	}
	return origin;
}

/**
 * Expand a pattern's repeats into a flat measure list for playback, reusing the import
 * feature's tested `expandRepeats`. Returns the expanded pattern plus the expanded→original
 * index map for cursor mapping. On invalid repeat markup (or no repeats) the pattern is
 * returned unexpanded with an identity map — defensive; the editor blocks saving invalid
 * markup, so playback only ever sees sound patterns.
 */
export function expandFingerpickPattern(pattern: FingerpickPattern): ExpandedPattern {
	const identity = pattern.measures.map((_, i) => i);
	const { directives, error } = deriveRepeatDirectives(pattern.measures);
	if (error || directives.length === 0) {
		return { pattern, originMeasureIndices: identity };
	}
	const { measures } = expandRepeats(pattern.measures, directives);
	const originMeasureIndices = expandOriginIndices(pattern.measures.length, directives);
	return { pattern: { ...pattern, measures }, originMeasureIndices };
}

/**
 * Map an ORIGINAL measure index to its FIRST occurrence in the expanded timeline.
 * Used for click-to-seek: clicking a measure always seeks to its first pass, regardless of
 * which repeat pass is currently playing (intentional — see issue #125). Pure. Falls back to
 * the input index when unmapped (identity / no-repeat case).
 */
export function mapOriginToExpandedIndex(
	originMeasureIndices: number[],
	originIndex: number,
): number {
	const idx = originMeasureIndices.indexOf(originIndex);
	return idx === -1 ? originIndex : idx;
}
