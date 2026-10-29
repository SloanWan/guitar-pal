import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { chordFretHints, effectiveChords, type FretHint } from "@/lib/fingerpickChords";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { getChordIndex } from "@/lib/chords";
import { selectRefVoicing } from "@/lib/strumBars";
import { chordIndexWithUser } from "@/lib/userChordVoicings";
import { useChordShapeCorpus } from "@/components/chords/useChordShapeMatches";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import { useChordVoicings } from "@/components/fingerpick/useChordVoicings";

/**
 * What the editor needs to know about chords: the chord in effect under every
 * slot, its shapes (the library's and the player's own), the search's index and
 * the shape corpus typed frets are matched against, and the shape under a slot as
 * the frets each string plays (index 0 = high e, "/" for a string it leaves out) —
 * the dock's faint hints. All of it loads with the editor and only with it.
 */
export function useChordTools(pattern: FingerpickPattern, user: User | null, loading: boolean) {
	const { voicings: userVoicings, saveVoicing } = useUserChordVoicings(user, loading);
	const chordsInEffect = useMemo(() => effectiveChords(pattern.measures), [pattern.measures]);
	const refs = useMemo(
		() => pattern.measures.flatMap((m) => m.slots.flatMap((slot) => (slot.chord ? [slot.chord] : []))),
		[pattern.measures],
	);
	const voicingsFor = useChordVoicings(refs, userVoicings);

	const [chordIndex, setChordIndex] = useState<readonly ChordIndexEntry[]>([]);
	useEffect(() => {
		let cancelled = false;
		getChordIndex()
			.then((index) => {
				if (!cancelled) setChordIndex(index);
			})
			.catch((e: unknown) => console.error("[tab editor] chord index:", e));
		return () => {
			cancelled = true;
		};
	}, []);
	const searchIndex = useMemo(() => chordIndexWithUser(chordIndex, userVoicings), [chordIndex, userVoicings]);
	const shapeCorpus = useChordShapeCorpus(true);

	const hintsAt = useCallback(
		(measureIndex: number, slotIndex: number): FretHint[] | null => {
			const ref = chordsInEffect[measureIndex]?.[slotIndex];
			if (!ref) return null;
			const state = voicingsFor(ref);
			const voicing = state.status === "ready" ? selectRefVoicing(ref, state.voicings) : null;
			return voicing ? chordFretHints(voicing) : null;
		},
		[chordsInEffect, voicingsFor],
	);

	return { chordsInEffect, voicingsFor, searchIndex, shapeCorpus, saveVoicing, hintsAt };
}

export type ChordTools = ReturnType<typeof useChordTools>;
