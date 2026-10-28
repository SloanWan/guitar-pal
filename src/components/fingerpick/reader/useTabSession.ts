import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import { setPatternCapo } from "@/lib/fingerpickChords";
import { saveLastPattern } from "@/lib/lastPattern";
import type { SharedFingerpick } from "@/lib/sharedItems";
import { createClient } from "@/lib/supabase";
import { useFingerpickPatterns } from "@/components/fingerpick/useFingerpickPatterns";
import { readLastPatternId, writeLastPatternId } from "@/components/fingerpick/useFingerpickPrefs";

interface Args {
	/** A share page's snapshot: what is open, and the only thing that can be. */
	shared?: SharedFingerpick;
	user: User | null;
	loading: boolean;
	/** Another tab is about to open: the transport, tempo and cursor go back to its start. */
	onOpen: (pattern: FingerpickPattern) => void;
	/** The open tab itself changed (an edit saved, the capo moved): what plays follows it. */
	onChanged: (pattern: FingerpickPattern) => void;
}

/**
 * Which tab is open and every way it changes: picked from the library, restored
 * on arrival (a `?pattern=` link, else the last one this browser opened), saved
 * from the editor, re-capoed, deleted. On a share page the snapshot is the tab
 * and changes to it (the capo) last for the visit.
 */
export function useTabSession({ shared, user, loading, onOpen, onChanged }: Args) {
	const library = useFingerpickPatterns(user, loading);
	const [sharedPattern, setSharedPattern] = useState(shared?.pattern);
	const selected = sharedPattern ?? library.selectedPattern;
	// False until the tab to open is known, so the default preset never flashes first.
	const [restored, setRestored] = useState(shared !== undefined);
	const owned = library.customPatterns.some((p) => p.id === selected.id);

	function show(pattern: FingerpickPattern) {
		if (shared) setSharedPattern(pattern);
		else library.setSelectedPattern(pattern);
	}

	function select(pattern: FingerpickPattern) {
		// A choice ends the restore window: a late-loading saved id must not override it.
		setRestored(true);
		onOpen(pattern);
		show(pattern);
		// Mirrored to the account so /home can offer it on another device.
		if (!shared) saveLastPattern(createClient(), user, "fingerpick", pattern.id).catch(console.error);
	}

	/** Saves a tab of the player's own; a new one opens. Returns what was stored (its name may have gained a counter). */
	function save(pattern: FingerpickPattern): FingerpickPattern {
		const saved = library.saveCustomPattern(pattern);
		if (saved.isNew) select(saved.pattern);
		else if (saved.pattern.id === selected.id) onChanged(saved.pattern);
		return saved.pattern;
	}

	/** "Open at … from now on": the tempo already plays, so nothing restarts. */
	function saveTempo(bpm: number) {
		library.saveCustomPattern({ ...selected, bpm });
	}

	function remove(id: string) {
		if (id === selected.id) onOpen(PRESET_FINGERPICK_PATTERNS[0]);
		library.deleteCustomPattern(id);
	}

	/** The player's own tab is saved with its capo; a preset or a share keeps it for the visit. */
	function setCapo(fret: number) {
		const next = setPatternCapo(selected, fret);
		if (owned) {
			save(next);
			return;
		}
		show(next);
		onChanged(next);
	}

	// Reopen the last tab once the player's own have loaded (they arrive async),
	// through select so tempo and cursor follow as for a pick.
	useEffect(() => {
		if (shared || restored || library.isLoading) return;
		const savedId = readLastPatternId();
		const match = savedId && savedId !== selected.id ? library.patterns.find((p) => p.id === savedId) : undefined;
		// A one-shot sync from storage after the async load.
		/* eslint-disable react-hooks/set-state-in-effect */
		if (match) select(match);
		else setRestored(true);
		/* eslint-enable react-hooks/set-state-in-effect */
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [library.isLoading, restored]);

	// Remembered so a refresh reopens it; not before the restore, or the default would overwrite it.
	useEffect(() => {
		if (restored && !shared) writeLastPatternId(selected.id);
	}, [selected.id, restored, shared]);

	return {
		patterns: library.patterns,
		customPatterns: library.customPatterns,
		favouriteIds: library.favouriteIds,
		toggleFavourite: library.toggleFavourite,
		isLoading: library.isLoading,
		selected,
		restored,
		owned,
		select,
		save,
		saveTempo,
		remove,
		setCapo,
	};
}

export type TabSession = ReturnType<typeof useTabSession>;
