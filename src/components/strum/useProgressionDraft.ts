import { useState } from "react";
import type { Bar, ChordProgression, ChordRef } from "@/lib/strumPatterns";
import { appendChordBar, removeBar, setChordInReach, type VoicingScope } from "@/lib/strumBarEdit";
import { normalizeCapo } from "@/lib/strumProgressions";

interface Fields {
	bars: Bar[];
	name: string;
	capo: number;
}

function fieldsOf(progression: ChordProgression): Fields {
	return { bars: progression.bars, name: progression.name ?? "", capo: normalizeCapo(progression.capo) };
}

export interface ProgressionDraft {
	/** The open progression with the edits in progress, or null when none is open. */
	progression: ChordProgression | null;
	dirty: boolean;
	setName: (name: string) => void;
	setCapo: (capo: number) => void;
	/** Give a bar — or every bar of its chord — a chord and shape. */
	applyChord: (barIdx: number, chord: ChordRef, scope: VoicingScope) => void;
	/** Adds a bar holding the last chord; returns its index. */
	addBar: () => number;
	removeBar: (barIdx: number) => void;
	revert: () => void;
}

/**
 * The open progression's edits — chords, bars, name, capo — held until Save.
 *
 * Like the rhythm draft, it belongs to the progression as it was saved: opening
 * another, or the progression being saved, leaves it behind. What plays is the
 * draft, so a chord changed is a chord heard.
 */
export function useProgressionDraft(open: ChordProgression | null): ProgressionDraft {
	const savedKey = open ? JSON.stringify(fieldsOf(open)) : "";
	const [draft, setDraft] = useState<{ id: string; base: string; value: Fields } | null>(null);
	const live = draft && open && draft.id === open.id && draft.base === savedKey ? draft.value : null;
	const value = live ?? (open ? fieldsOf(open) : null);

	function edit(change: (fields: Fields) => Fields) {
		if (!open || !value) return;
		setDraft({ id: open.id, base: savedKey, value: change(value) });
	}

	return {
		progression: open && value ? { ...open, bars: value.bars, name: value.name, capo: value.capo } : null,
		dirty: live !== null && JSON.stringify(live) !== savedKey,
		setName: (name) => edit((f) => ({ ...f, name })),
		setCapo: (capo) => edit((f) => ({ ...f, capo: normalizeCapo(capo) })),
		applyChord: (barIdx, chord, scope) =>
			edit((f) => ({ ...f, bars: setChordInReach(f.bars, barIdx, chord, scope) })),
		addBar: () => {
			const index = value?.bars.length ?? 0;
			edit((f) => ({ ...f, bars: appendChordBar(f.bars) }));
			return index;
		},
		removeBar: (barIdx) => edit((f) => ({ ...f, bars: removeBar(f.bars, barIdx) })),
		revert: () => setDraft(null),
	};
}
