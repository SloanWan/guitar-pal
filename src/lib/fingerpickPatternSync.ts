import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { FingerpickPattern, Measure } from "./fingerpickTypes";
import { normalizeLoadedPattern } from "./fingerpickEdit";

// localStorage key for guest (logged-out) custom fingerpick patterns.
export const LOCAL_FINGERPICK_PATTERNS_KEY = "customFingerpickPatterns";
/** Where a signed-out player's favourites live; the hook reads the same key. */
export const LOCAL_FINGERPICK_FAVOURITES_KEY = "favouriteFingerpickPatternIds";

// Row shape for the `user_fingerpick_patterns` table. Mirrors the discrete-column
// convention used by `user_strum_patterns`: identity + name/description plus the
// structural fields (bpm, time signature, measures) stored as their own columns.
type FingerpickPatternRow = {
	pattern_id: string;
	name: string;
	description: string | null;
	bpm: number;
	time_signature: [number, number];
	measures: Measure[];
};

function rowToPattern(row: FingerpickPatternRow): FingerpickPattern {
	// Migrate any legacy `duration: "rest"` slots to the isRest-flag model on load.
	return normalizeLoadedPattern({
		id: row.pattern_id,
		name: row.name,
		description: row.description ?? "",
		bpm: row.bpm,
		timeSignature: row.time_signature,
		measures: row.measures,
	});
}

function patternToRow(user: User, pattern: FingerpickPattern) {
	return {
		user_id: user.id,
		pattern_id: pattern.id,
		name: pattern.name,
		description: pattern.description ?? "",
		bpm: pattern.bpm,
		time_signature: pattern.timeSignature,
		measures: pattern.measures,
	};
}

// ── localStorage helpers (guest path) ────────────────────────────────────────

export function readLocalFingerpickPatterns(): FingerpickPattern[] {
	try {
		const saved = localStorage.getItem(LOCAL_FINGERPICK_PATTERNS_KEY);
		if (saved) return (JSON.parse(saved) as FingerpickPattern[]).map(normalizeLoadedPattern);
	} catch {
		// ignore malformed data
	}
	return [];
}

function writeLocalFingerpickPatterns(patterns: FingerpickPattern[]): void {
	localStorage.setItem(LOCAL_FINGERPICK_PATTERNS_KEY, JSON.stringify(patterns));
}

// ── Load ─────────────────────────────────────────────────────────────────────

// Guest → localStorage; logged-in → `user_fingerpick_patterns` table.
export async function loadUserFingerpickPatterns(
	supabase: SupabaseClient,
	user: User | null,
): Promise<FingerpickPattern[]> {
	if (!user) return readLocalFingerpickPatterns();

	const { data, error } = await supabase
		.from("user_fingerpick_patterns")
		.select("pattern_id, name, description, bpm, time_signature, measures")
		.eq("user_id", user.id);
	if (error) throw new Error(error.message);
	return (data ?? []).map((row) => rowToPattern(row as FingerpickPatternRow));
}

// ── Save (insert or update) ──────────────────────────────────────────────────

// Upserts by pattern_id so the same function serves both create and edit flows.
export async function saveUserFingerpickPattern(
	supabase: SupabaseClient,
	user: User | null,
	pattern: FingerpickPattern,
): Promise<void> {
	if (!user) {
		const existing = readLocalFingerpickPatterns();
		const idx = existing.findIndex((p) => p.id === pattern.id);
		if (idx === -1) existing.push(pattern);
		else existing[idx] = pattern;
		writeLocalFingerpickPatterns(existing);
		return;
	}

	const { error } = await supabase
		.from("user_fingerpick_patterns")
		.upsert(patternToRow(user, pattern), { onConflict: "user_id,pattern_id" });
	if (error) throw new Error(error.message);
}

// ── Delete ─────────────────────────────────────────────────────────────────

/**
 * Delete a pattern, and the favourite record that pointed at it.
 *
 * The cascade lives here rather than at the call site because forgetting it
 * fails silently and late: the row survives the deletion, and the pattern comes
 * back as a ghost favourite on the next sign-in — a list entry for something
 * that can no longer be opened. There is one place a pattern is deleted, so
 * there is one place this can be forgotten.
 */
export async function deleteUserFingerpickPattern(
	supabase: SupabaseClient,
	user: User | null,
	patternId: string,
): Promise<void> {
	if (!user) {
		writeLocalFingerpickPatterns(
			readLocalFingerpickPatterns().filter((p) => p.id !== patternId),
		);
		removeLocalFingerpickFavourite(patternId);
		return;
	}

	const { error } = await supabase
		.from("user_fingerpick_patterns")
		.delete()
		.eq("pattern_id", patternId)
		.eq("user_id", user.id);
	if (error) throw new Error(error.message);

	const { error: favouriteError } = await supabase
		.from("user_favourite_fingerpick_patterns")
		.delete()
		.eq("pattern_id", patternId)
		.eq("user_id", user.id);
	if (favouriteError) throw new Error(favouriteError.message);
}

/** Drop one id from the signed-out favourites list. Best-effort, like the rest. */
function removeLocalFingerpickFavourite(patternId: string): void {
	try {
		const saved = localStorage.getItem(LOCAL_FINGERPICK_FAVOURITES_KEY);
		if (!saved) return;
		const ids = JSON.parse(saved) as unknown;
		if (!Array.isArray(ids)) return;
		localStorage.setItem(
			LOCAL_FINGERPICK_FAVOURITES_KEY,
			JSON.stringify(ids.filter((id) => id !== patternId)),
		);
	} catch {
		// A corrupt or unavailable store is not a reason to fail the delete.
	}
}

// ── Merge local → Supabase (called on login) ─────────────────────────────────

// Inserts any localStorage patterns not already present in the account, then
// clears the local key. Returns the number of patterns migrated.
export async function mergeLocalFingerpickPatternsToSupabase(
	supabase: SupabaseClient,
	user: User,
): Promise<number> {
	const localPatterns = readLocalFingerpickPatterns();
	if (localPatterns.length === 0) return 0;

	const { data: existing } = await supabase
		.from("user_fingerpick_patterns")
		.select("pattern_id")
		.eq("user_id", user.id);
	const existingIds = new Set((existing ?? []).map((r) => r.pattern_id as string));

	const toInsert = localPatterns.filter((p) => !existingIds.has(p.id));
	if (toInsert.length > 0) {
		const { error } = await supabase
			.from("user_fingerpick_patterns")
			.insert(toInsert.map((p) => patternToRow(user, p)));
		if (error) throw new Error(error.message);
	}

	localStorage.removeItem(LOCAL_FINGERPICK_PATTERNS_KEY);
	return toInsert.length;
}
