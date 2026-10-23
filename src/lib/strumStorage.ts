import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Bar, Beat, ChordProgression, StrumPattern } from "./strumPatterns";
import { PRESET_STRUM_PATTERNS } from "./strumPatterns";
import {
	normalizeBars,
	normalizeBeats,
	normalizeBpm,
	patternBpm,
	patternMeter,
	sortPatternsByNewest,
	uniquePatternName,
	validateBars,
} from "./strumBars";
import { normalizeCapo, progressionDisplayName } from "./strumProgressions";
import { normalizeMeter, type Meter } from "./strumMeter";
import { alignToRhythm, extraBarsFromColumn, followsRhythm, patternRhythm, rhythmOfBars, withRhythm } from "./strumRhythm";

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
 * Set once a guest's stored progressions have been brought under the rule that
 * every sequence plays its pattern's rhythm (`migrateGuestStrumStorage`).
 */
export const GUEST_RHYTHM_LIFT_KEY = "strumRhythmLift:v1";

/** A Supabase row from `user_strum_patterns`; the table is not code-generated. */
export interface StrumPatternRow {
	pattern_id: string;
	name: string;
	beats: Beat[];
	/** The whole rhythm as `[{ beats, chord: null }]`; `beats` is its first bar. */
	bars?: unknown;
	bpm?: unknown;
	/** Absent on every row written before meters existed; reads back as 4/4. */
	meter?: unknown;
	/** Written by the database on insert; what the library orders on. */
	created_at?: string;
}

/** A stored row back into a pattern, its further bars read out of `bars`. */
export function patternFromRow(row: StrumPatternRow): StrumPattern {
	const beats = normalizeBeats(row.beats);
	const extraBars = extraBarsFromColumn(beats, row.bars);
	return {
		id: row.pattern_id,
		name: row.name,
		beats,
		...(extraBars ? { extraBars } : {}),
		bpm: normalizeBpm(row.bpm),
		meter: normalizeMeter(row.meter),
		createdAt: row.created_at,
	};
}

/**
 * Columns written for a pattern. `bars` is the whole rhythm, chordless, and
 * `beats` its first bar — double-written so a reader that only knows `beats`
 * still plays the pattern's opening bar. Chord sequences live in their own
 * table, never here.
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
		bars: patternRhythm(pattern).map((beats) => ({ beats, chord: null })),
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
			// Only the fields a progression has now: rows written while sequences
			// could drift from their pattern also carry its bookkeeping.
			.map(({ id, patternId, bars, orderIndex, name, bpm, capo }) => ({
				id,
				patternId,
				bars: normalizeBars(bars),
				orderIndex,
				name,
				bpm,
				capo,
			}));
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
	imported: ChordProgression[],
): Promise<void> {
	// A snapshot shared before every sequence followed its pattern may hold bars
	// of another rhythm; the copy is written the way it will play.
	const rhythm = patternRhythm(pattern);
	const progressions = imported.map((p) => ({ ...p, bars: alignToRhythm(p.bars, rhythm) }));
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

/** What `liftDivergedProgressions` decided: patterns to add, sequences to rewrite. */
export interface RhythmLift {
	patterns: StrumPattern[];
	progressions: ChordProgression[];
}

/**
 * Bring sequences written before every sequence followed its pattern under that
 * rule, without changing how any of them sounds.
 *
 * A sequence whose bars still play its pattern's rhythm is only re-aligned (a
 * no-op for its sound). One whose bars were re-written to a rhythm of their own
 * gets that rhythm as a new pattern of the player's — named after both, so it is
 * recognisable in the library — and is moved onto it. A sequence over a pattern
 * that no longer exists is left alone; nothing it could be compared with is left.
 *
 * Pure, so the guest migration below and the one-time database script
 * (scripts/lift-diverged-progressions.ts) make exactly the same decisions.
 */
export function liftDivergedProgressions(
	patterns: readonly StrumPattern[],
	progressions: readonly ChordProgression[],
	newId: () => string,
): RhythmLift {
	const known = [...PRESET_STRUM_PATTERNS, ...patterns];
	const added: StrumPattern[] = [];
	const changed: ChordProgression[] = [];
	for (const progression of progressions) {
		const pattern = known.find((p) => p.id === progression.patternId);
		if (!pattern || progression.bars.length === 0) continue;
		const rhythm = patternRhythm(pattern);
		if (followsRhythm(progression.bars, rhythm)) continue;
		const own = rhythmOfBars(progression.bars);
		const lifted = withRhythm(
			{
				id: newId(),
				name: uniquePatternName(
					`${pattern.name} · ${progressionDisplayName(progression)}`,
					[...known, ...added],
				),
				beats: [],
				bpm: patternBpm(pattern),
				meter: patternMeter(pattern),
			},
			own,
		);
		added.push(lifted);
		changed.push({ ...progression, patternId: lifted.id });
	}
	return { patterns: added, progressions: changed };
}

/**
 * Run `liftDivergedProgressions` over a guest's stored library, once. Idempotent
 * past the flag too — a lifted sequence follows its new pattern — so the two
 * strum hooks may both call it before reading.
 */
export function migrateGuestStrumStorage(): void {
	try {
		if (localStorage.getItem(GUEST_RHYTHM_LIFT_KEY)) return;
		const savedPatterns = localStorage.getItem(STRUM_PATTERNS_STORAGE_KEY);
		const patterns = savedPatterns ? (JSON.parse(savedPatterns) as StrumPattern[]) : [];
		const progressions = readStoredProgressions();
		const lift = liftDivergedProgressions(patterns, progressions, () => crypto.randomUUID());
		if (lift.patterns.length > 0) {
			const stamp = new Date().toISOString();
			localStorage.setItem(
				STRUM_PATTERNS_STORAGE_KEY,
				JSON.stringify(
					sortPatternsByNewest([...patterns, ...lift.patterns.map((p) => ({ ...p, createdAt: stamp }))]),
				),
			);
			const moved = new Map(lift.progressions.map((p) => [p.id, p]));
			localStorage.setItem(
				STRUM_PROGRESSIONS_STORAGE_KEY,
				JSON.stringify(progressions.map((p) => moved.get(p.id) ?? p)),
			);
		}
		localStorage.setItem(GUEST_RHYTHM_LIFT_KEY, "1");
	} catch {
		// Unreadable storage is read as empty everywhere else; nothing to lift.
	}
}
