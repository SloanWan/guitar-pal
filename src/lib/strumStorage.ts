import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Bar, Beat, ChordProgression, StrumPattern } from "./strumPatterns";
import { normalizeBars, normalizeBpm, patternBpm, patternMeter, sortPatternsByNewest, validateBars } from "./strumBars";
import { normalizeCapo, normalizeProgressionSync } from "./strumProgressions";
import type { Meter } from "./strumMeter";

/**
 * Where a strum pattern and its progressions are written — the row shapes
 * for `user_strum_patterns` / `user_pattern_progressions`, and the
 * localStorage keys a guest's copies live under. The two hooks on the strum
 * page own the reads and the lists; this is the part an import (a shared
 * snapshot, src/lib/sharedItems.ts) needs as well, so it lives where both can
 * reach it.
 */

/** A guest's own patterns, as `StrumPattern[]`. */
export const STRUM_PATTERNS_STORAGE_KEY = "customStrumPatterns";
/** A guest's progressions across every pattern, as `ChordProgression[]`. */
export const STRUM_PROGRESSIONS_STORAGE_KEY = "chordProgressions";

/**
 * Columns written for a pattern. `bars` mirrors the single bar so the column
 * stays consistent with `beats` for any reader still looking at it; chord
 * sequences live in their own table, never here.
 */
export function patternColumns(pattern: StrumPattern): {
	name: string;
	beats: Beat[];
	bars: Bar[];
	bpm: number;
	meter: Meter;
} {
	return {
		name: pattern.name,
		beats: pattern.beats,
		bars: [{ beats: pattern.beats, chord: null }],
		bpm: patternBpm(pattern),
		meter: patternMeter(pattern),
	};
}

export function progressionColumns(progression: ChordProgression, userId: string) {
	return {
		id: progression.id,
		user_id: userId,
		pattern_id: progression.patternId,
		bars: progression.bars,
		order_index: progression.orderIndex,
		name: progression.name?.trim() || null,
		bpm: progression.bpm === undefined ? null : normalizeBpm(progression.bpm),
		capo: normalizeCapo(progression.capo),
		synced_beats: progression.syncedBeats ?? null,
		follows_pattern: progression.followsPattern ?? null,
		sync_notice_dismissed: progression.syncNoticeDismissed ?? null,
	};
}

/** A guest's stored progressions, with the same guard the hook applies on read. */
export function readStoredProgressions(): ChordProgression[] {
	try {
		const saved = localStorage.getItem(STRUM_PROGRESSIONS_STORAGE_KEY);
		if (!saved) return [];
		return (JSON.parse(saved) as ChordProgression[])
			.filter((p) => validateBars(p.bars).ok)
			// Local storage is as untrusted as the database; the same guard applies.
			.map((p) => ({ ...p, bars: normalizeBars(p.bars), ...normalizeProgressionSync(p) }));
	} catch {
		return [];
	}
}

/**
 * Write a new pattern and the progressions over it — the browser for a
 * guest, the account when signed in. Awaited to the end so a caller that
 * navigates next finds the rows there: the strum page's hooks save in the
 * background and reload, which is right for a page that stays put and wrong
 * for one about to leave.
 */
export async function importStrumPattern(
	supabase: SupabaseClient,
	user: User | null,
	pattern: StrumPattern,
	progressions: ChordProgression[],
): Promise<void> {
	if (!user) {
		// No database to stamp it, so the save does: without a creation time a
		// guest's patterns have no order to be listed in.
		const stamped: StrumPattern = { ...pattern, createdAt: pattern.createdAt ?? new Date().toISOString() };
		let existing: StrumPattern[] = [];
		try {
			const saved = localStorage.getItem(STRUM_PATTERNS_STORAGE_KEY);
			if (saved) existing = JSON.parse(saved) as StrumPattern[];
		} catch {
			// unreadable storage: start the list afresh rather than lose the import
		}
		localStorage.setItem(
			STRUM_PATTERNS_STORAGE_KEY,
			JSON.stringify(sortPatternsByNewest([...existing, stamped])),
		);
		if (progressions.length > 0) {
			localStorage.setItem(
				STRUM_PROGRESSIONS_STORAGE_KEY,
				JSON.stringify([...readStoredProgressions(), ...progressions]),
			);
		}
		return;
	}

	const { error } = await supabase
		.from("user_strum_patterns")
		.insert({ user_id: user.id, pattern_id: pattern.id, ...patternColumns(pattern) });
	if (error) throw new Error(error.message);
	if (progressions.length > 0) {
		const { error: progressionError } = await supabase
			.from("user_pattern_progressions")
			.upsert(progressions.map((progression) => progressionColumns(progression, user.id)));
		if (progressionError) throw new Error(progressionError.message);
	}
}
