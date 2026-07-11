import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { FingerpickPattern, Measure } from "./fingerpickTypes";

// localStorage key for guest (logged-out) custom fingerpick patterns.
export const LOCAL_FINGERPICK_PATTERNS_KEY = "customFingerpickPatterns";

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
	return {
		id: row.pattern_id,
		name: row.name,
		description: row.description ?? "",
		bpm: row.bpm,
		timeSignature: row.time_signature,
		measures: row.measures,
	};
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
		if (saved) return JSON.parse(saved) as FingerpickPattern[];
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

export async function deleteUserFingerpickPattern(
	supabase: SupabaseClient,
	user: User | null,
	patternId: string,
): Promise<void> {
	if (!user) {
		writeLocalFingerpickPatterns(
			readLocalFingerpickPatterns().filter((p) => p.id !== patternId),
		);
		return;
	}

	const { error } = await supabase
		.from("user_fingerpick_patterns")
		.delete()
		.eq("pattern_id", patternId)
		.eq("user_id", user.id);
	if (error) throw new Error(error.message);
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
