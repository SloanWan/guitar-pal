"use client";

import { useEffect, useMemo, useState } from "react";
import type { Bar, ChordRef } from "@/lib/strumPatterns";
import { chordRefToDiagram } from "@/lib/strumBars";
import { loadVoicings, peekVoicings, voicingCacheKey } from "@/lib/chordVoicingCache";
import type { ChordVoicing, VexChordDef } from "@/lib/chordVoicingToVexChords";
import { mergeVoicings, type UserChordVoicing } from "@/lib/userChordVoicings";

/**
 * A bar's fretboard shape, or the fact that it is still on its way. Null — no
 * chord, no voicings, or a lookup that failed — means "show the name instead".
 */
export type BarChordDiagram = { status: "loading" } | { status: "ready"; def: VexChordDef };

function keyOf(ref: ChordRef): string {
	return voicingCacheKey(ref.root, ref.suffix);
}

/**
 * Fretboard shapes for the bars on screen, index-aligned with `bars`.
 *
 * Nothing is fetched while `enabled` is false, so the chord-name view costs no
 * queries. What is fetched goes through the shared `voicingCache`, which the
 * strum engine's own chord resolution already fills — so by the time the
 * diagrams are switched on, their chords are usually in memory and the shapes
 * render on the first paint, with no loading state at all.
 */
export function useBarChordDiagrams(
	bars: Bar[],
	enabled: boolean,
	/**
	 * The player's own shapes. Without them a bar pinned to one draws the
	 * library's standard voicing instead — `selectRefVoicing` cannot find an id
	 * that is not in the list it was handed.
	 */
	userVoicings: readonly UserChordVoicing[] = [],
): (BarChordDiagram | null)[] {
	// Which lookups have settled. The voicings themselves live in the shared
	// cache; this only records the outcome, so a resolved fetch re-renders and a
	// failed one stops the bar waiting forever.
	const [outcomes, setOutcomes] = useState<Record<string, "ok" | "failed">>({});

	// Serialized so the effect keys on the chords themselves, not on the bars
	// array's identity — a re-render with the same chords must not refetch.
	const wantedKey = useMemo(() => {
		if (!enabled) return "";
		const seen = new Map<string, ChordRef>();
		for (const bar of bars) {
			if (bar.chord) seen.set(keyOf(bar.chord), bar.chord);
		}
		return JSON.stringify([...seen.values()].map(({ root, suffix }) => ({ root, suffix })));
	}, [bars, enabled]);

	useEffect(() => {
		if (!wantedKey) return;
		const refs = (JSON.parse(wantedKey) as ChordRef[]).filter(
			(ref) => peekVoicings(ref.root, ref.suffix) === null,
		);
		if (refs.length === 0) return;

		let cancelled = false;
		// Fired together, not awaited in turn: four bars cost one round trip's
		// worth of waiting, and the cache joins any request already in flight.
		for (const ref of refs) {
			const key = keyOf(ref);
			loadVoicings(ref.root, ref.suffix)
				.then(() => {
					if (!cancelled) setOutcomes((prev) => ({ ...prev, [key]: "ok" }));
				})
				.catch((err: unknown) => {
					// Let the bar fall back to its chord name rather than spin; the
					// cache keeps no failure, so switching views retries.
					if (!cancelled) setOutcomes((prev) => ({ ...prev, [key]: "failed" }));
					console.error("[useBarChordDiagrams] voicing lookup failed:", err);
				});
		}
		return () => {
			cancelled = true;
		};
	}, [wantedKey]);

	return useMemo(
		() =>
			bars.map((bar) => {
				if (!enabled || !bar.chord) return null;
				const cached = peekVoicings(bar.chord.root, bar.chord.suffix);
				const mine = userVoicings.filter(
					(v) => v.root === bar.chord!.root && v.suffix === bar.chord!.suffix,
				);
				if (cached === null && mine.length === 0) {
					return outcomes[keyOf(bar.chord)] === "failed" ? null : { status: "loading" };
				}
				// A chord the library has nothing for still draws, if the player has
				// written a shape for it.
				const available: ChordVoicing[] = mergeVoicings(
					cached ?? [],
					userVoicings,
					bar.chord.root,
					bar.chord.suffix,
				);
				const def = chordRefToDiagram(bar.chord, available);
				return def ? { status: "ready", def } : null;
			}),
		[bars, enabled, outcomes, userVoicings],
	);
}
