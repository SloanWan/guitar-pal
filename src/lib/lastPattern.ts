import type { SupabaseClient, User } from "@supabase/supabase-js";

// The two tools that track an account-level "last practiced" pattern. Kept in
// sync with the `tool` CHECK constraint on the `user_last_pattern` table.
export type PatternTool = "strum" | "fingerpick";

// A pattern-like object with at least an id and name — both `StrumPattern` and
// `FingerpickPattern` structurally satisfy this.
export interface NamedPattern {
	id: string;
	name: string;
}

// Upsert the user's last-opened pattern for a tool. No-op for guests: the table
// is account-scoped, and device-local recall already lives in localStorage.
export async function saveLastPattern(
	supabase: SupabaseClient,
	user: User | null,
	tool: PatternTool,
	patternId: string,
): Promise<void> {
	// Offline it can only fail; the next pattern opened online records itself (#469).
	if (!user || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
	const { error } = await supabase
		.from("user_last_pattern")
		.upsert(
			{ user_id: user.id, tool, pattern_id: patternId },
			{ onConflict: "user_id,tool" },
		);
	if (error) throw new Error(error.message);
}
