"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChordRef } from "@/lib/strumPatterns";
import { isNoChord } from "@/lib/fingerpickChords";
import { loadVoicings, peekVoicings, voicingCacheKey } from "@/lib/chordVoicingCache";
import type { ChordVoicing } from "@/lib/chordVoicing";
import { mergeVoicings, type UserChordVoicing } from "@/lib/userChordVoicings";

/**
 * The shapes a chord can be held in, or the fact that they are still on their
 * way. `failed` means the lookup errored or timed out; the cache keeps no
 * failure, so `retry` (or the next mount) asks again.
 */
export type ChordVoicingsState =
	| { status: "loading" }
	| { status: "failed"; retry: () => void }
	| { status: "ready"; voicings: ChordVoicing[] };

const keyOf = (ref: ChordRef): string => voicingCacheKey(ref.root, ref.suffix);

/**
 * Voicings for every chord in `refs`, looked up by chord identity.
 *
 * The sibling of `useBarChordDiagrams` for the fingerpick editor, which needs
 * the voicing list itself — to let the player pick one, and to read frets off
 * it — rather than a finished diagram. Each distinct chord is fetched once
 * through the shared `voicingCache`, so the same chord on twenty slots costs
 * one round trip, and one already resolved elsewhere costs none.
 */
export function useChordVoicings(
	refs: readonly ChordRef[],
	/** The player's own shapes, merged after the library's so the standard voicing stays the library's. */
	userVoicings: readonly UserChordVoicing[] = [],
): (ref: ChordRef) => ChordVoicingsState {
	// Which lookups have settled. The voicings live in the shared cache; this
	// only records outcomes, so a resolved fetch re-renders and a failed one
	// stops its chord waiting forever.
	const [outcomes, setOutcomes] = useState<Record<string, "ok" | "failed">>({});
	// Bumped by a retry, so the lookups run again for whatever is still missing.
	const [attempt, setAttempt] = useState(0);

	// Serialized so the effect keys on the chord identities, not on the array's
	// identity — a re-render with the same chords must not refetch.
	const wantedKey = useMemo(() => {
		const seen = new Map<string, ChordRef>();
		// N.C. has no shapes to look up.
		for (const ref of refs) if (!isNoChord(ref)) seen.set(keyOf(ref), ref);
		return JSON.stringify([...seen.values()].map(({ root, suffix }) => ({ root, suffix })));
	}, [refs]);

	useEffect(() => {
		const wanted = (JSON.parse(wantedKey) as ChordRef[]).filter(
			(ref) => peekVoicings(ref.root, ref.suffix) === null,
		);
		if (wanted.length === 0) return;
		let cancelled = false;
		for (const ref of wanted) {
			const key = keyOf(ref);
			loadVoicings(ref.root, ref.suffix)
				.then(() => {
					if (!cancelled) setOutcomes((prev) => ({ ...prev, [key]: "ok" }));
				})
				.catch((err: unknown) => {
					if (!cancelled) setOutcomes((prev) => ({ ...prev, [key]: "failed" }));
					console.error("[useChordVoicings] voicing lookup failed:", err);
				});
		}
		return () => {
			cancelled = true;
		};
	}, [wantedKey, attempt]);

	const retry = useCallback(() => {
		setOutcomes((prev) => Object.fromEntries(Object.entries(prev).filter(([, outcome]) => outcome !== "failed")));
		setAttempt((n) => n + 1);
	}, []);

	return useCallback(
		(ref: ChordRef): ChordVoicingsState => {
			if (isNoChord(ref)) return { status: "ready", voicings: [] };
			const cached = peekVoicings(ref.root, ref.suffix);
			const mine = userVoicings.filter((v) => v.root === ref.root && v.suffix === ref.suffix);
			if (cached === null && mine.length === 0) {
				return outcomes[keyOf(ref)] === "failed" ? { status: "failed", retry } : { status: "loading" };
			}
			return {
				status: "ready",
				voicings: mergeVoicings(cached ?? [], userVoicings, ref.root, ref.suffix),
			};
		},
		[outcomes, userVoicings, retry],
	);
}
