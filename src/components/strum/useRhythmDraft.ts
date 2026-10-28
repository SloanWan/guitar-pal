import { useState } from "react";
import type { Beat, StrumPattern } from "@/lib/strumPatterns";
import { cycleRhythmCell, patternRhythm } from "@/lib/strumRhythm";

export interface RhythmDraft {
	/** What is on screen and what plays: the edit in progress, else the saved rhythm. */
	rhythm: Beat[][];
	dirty: boolean;
	toggle: (bar: number, beat: number, cell: number) => void;
	revert: () => void;
}

/**
 * The rhythm grid's edits, held apart from the pattern until saved.
 *
 * A draft belongs to one pattern *as it was saved*: switching pattern, or the
 * pattern being saved (here or in the composer), leaves it behind, so a stale
 * draft can never be shown over a rhythm it was not made from.
 */
export function useRhythmDraft(pattern: StrumPattern | null): RhythmDraft {
	const saved = pattern ? patternRhythm(pattern) : [];
	const savedKey = JSON.stringify(saved);
	const [draft, setDraft] = useState<{ id: string; base: string; rhythm: Beat[][] } | null>(null);
	const live = draft && pattern && draft.id === pattern.id && draft.base === savedKey ? draft.rhythm : null;
	const rhythm = live ?? saved;

	return {
		rhythm,
		dirty: live !== null && JSON.stringify(live) !== savedKey,
		toggle: (bar, beat, cell) => {
			if (!pattern) return;
			setDraft({ id: pattern.id, base: savedKey, rhythm: cycleRhythmCell(rhythm, bar, beat, cell) });
		},
		revert: () => setDraft(null),
	};
}
