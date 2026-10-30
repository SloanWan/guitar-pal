import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { chordFretHints, chordsUsed, effectiveChords, type FretHint } from "@/lib/fingerpickChords";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { getChordIndex } from "@/lib/chords";
import { loadVoicings } from "@/lib/chordVoicingCache";
import type { ChordRef } from "@/lib/strumPatterns";
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
 * `hear` plays a shape; `hearChord` finds a chord's shape (loading it if need be)
 * and plays that. The result keeps its identity while nothing in it changes, so
 * the bar blocks it is handed to stay memoized.
 */
export function useChordTools(
	pattern: FingerpickPattern,
	user: User | null,
	loading: boolean,
	hear: (hints: readonly FretHint[]) => void,
) {
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

	const voicingAt = useCallback(
		(target: { measureIndex: number; slotIndex: number }) => {
			const ref = chordsInEffect[target.measureIndex]?.[target.slotIndex];
			if (!ref) return null;
			const state = voicingsFor(ref);
			return state.status === "ready" ? selectRefVoicing(ref, state.voicings) : null;
		},
		[chordsInEffect, voicingsFor],
	);
	const hintsAt = useCallback(
		(measureIndex: number, slotIndex: number): FretHint[] | null => {
			const voicing = voicingAt({ measureIndex, slotIndex });
			return voicing ? chordFretHints(voicing) : null;
		},
		[voicingAt],
	);

	const hearChord = useCallback(
		(ref: ChordRef) => {
			const play = () => {
				const state = voicingsFor(ref);
				const voicing = state.status === "ready" ? selectRefVoicing(ref, state.voicings) : null;
				if (voicing) hear(chordFretHints(voicing));
			};
			if (voicingsFor(ref).status === "ready") play();
			// Read back through the shared cache once it has the chord.
			else loadVoicings(ref.root, ref.suffix).then(play, (e: unknown) => console.error("[tab editor] chord shapes:", e));
		},
		[voicingsFor, hear],
	);
	const used = useMemo(() => chordsUsed(pattern.measures), [pattern.measures]);

	return useMemo(
		() => ({ chordsInEffect, chordsUsed: used, voicingsFor, voicingAt, searchIndex, shapeCorpus, saveVoicing, hintsAt, hearChord }),
		[chordsInEffect, used, voicingsFor, voicingAt, searchIndex, shapeCorpus, saveVoicing, hintsAt, hearChord],
	);
}

export type ChordTools = ReturnType<typeof useChordTools>;
