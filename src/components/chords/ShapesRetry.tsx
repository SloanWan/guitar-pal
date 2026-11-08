"use client";

import { useSyncExternalStore } from "react";
import { voicingCache, voicingCacheKey } from "@/lib/chordVoicingCache";
import type { ChordKey } from "@/lib/chordVoicingsApi";

/**
 * One "Try again" for chord shapes that would not load (#463), behind every
 * surface that draws them. The failures live in the shared voicing cache, so a
 * press here retries every chord that failed, wherever it is drawn.
 */

const subscribe = voicingCache.subscribe;
const NO_RETRIES = () => 0;
const NONE: ReadonlySet<string> = new Set();
const NO_FAILURES = () => NONE;

/** The retry count: a lookup that keys on it runs again on each press of Try again. */
export function useVoicingRetries(): number {
	return useSyncExternalStore(subscribe, voicingCache.retries, NO_RETRIES);
}

/** The chords whose shapes failed and have not been retried since, by `voicingCacheKey`. */
export function useFailedShapes(): ReadonlySet<string> {
	return useSyncExternalStore(subscribe, voicingCache.failures, NO_FAILURES);
}

/** Whether any of these chords' shapes failed to load and have not been retried since. */
export function useShapesFailed(chords: readonly ChordKey[]): boolean {
	const failures = useFailedShapes();
	return chords.some(({ root, suffix }) => failures.has(voicingCacheKey(root, suffix)));
}

/** Nothing while the shapes are fine; a line with Try again once one of `chords` failed. */
export default function ShapesRetry({ chords, className = "" }: { chords: readonly ChordKey[]; className?: string }) {
	const failed = useShapesFailed(chords);
	if (!failed) return null;
	return (
		<p role="status" className={`m-0 text-[13px] leading-snug text-gp-ink-3 ${className}`}>
			Couldn&apos;t load the chord shapes.{" "}
			<button
				type="button"
				className="text-gp-ink-2 underline decoration-gp-edge underline-offset-[3px]"
				onClick={voicingCache.retryFailed}
			>
				Try again
			</button>
		</p>
	);
}
