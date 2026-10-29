import { useCallback, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import { chordFretHints, effectiveChords, type FretHint } from "@/lib/fingerpickChords";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { selectRefVoicing } from "@/lib/strumBars";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import { useChordVoicings } from "@/components/fingerpick/useChordVoicings";

/**
 * The shape under each slot, as the frets each string plays in it (index 0 =
 * high e, "/" for a string the shape leaves out): the dock's faint hints. The
 * chord in effect at a slot is the last one marked at or before it; a shape not
 * fetched yet hints nothing. The player's own shapes count, as on the reader.
 */
export function useShapeHints(pattern: FingerpickPattern, user: User | null, loading: boolean) {
	const { voicings: userVoicings } = useUserChordVoicings(user, loading);
	const chords = useMemo(() => effectiveChords(pattern.measures), [pattern.measures]);
	const refs = useMemo(
		() => pattern.measures.flatMap((m) => m.slots.flatMap((slot) => (slot.chord ? [slot.chord] : []))),
		[pattern.measures],
	);
	const voicingsFor = useChordVoicings(refs, userVoicings);
	return useCallback(
		(measureIndex: number, slotIndex: number): FretHint[] | null => {
			const ref = chords[measureIndex]?.[slotIndex];
			if (!ref) return null;
			const state = voicingsFor(ref);
			const voicing = state.status === "ready" ? selectRefVoicing(ref, state.voicings) : null;
			return voicing ? chordFretHints(voicing) : null;
		},
		[chords, voicingsFor],
	);
}
