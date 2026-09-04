import type { SupabaseClient, User } from "@supabase/supabase-js";

// The two tools that track an account-level "last practiced" pattern. Kept in
// sync with the `tool` CHECK constraint on the `user_last_pattern` table.
export type PatternTool = "strum" | "fingerpick";

// The most recently opened pattern id per tool for the signed-in user. A key is
// absent when the user has never opened that tool while signed in.
export type LastPatterns = {
	strum?: string;
	fingerpick?: string;
};

// Minimal shape needed to render a pattern card on /home. `source` distinguishes
// built-in presets from user-created patterns so the UI can badge them.
export interface PatternMeta {
	id: string;
	name: string;
	source: "preset" | "custom";
}

// A pattern-like object with at least an id and name — both `StrumPattern` and
// `FingerpickPattern` structurally satisfy this, so the resolver stays generic.
export interface NamedPattern {
	id: string;
	name: string;
}

// Pure: resolve a pattern id to display metadata, checking presets first, then
// the user's custom patterns. Returns null when the id no longer resolves — e.g.
// a favourite or last-practiced id whose custom pattern has since been deleted.
export function resolvePatternMeta(
	id: string,
	presets: NamedPattern[],
	customs: NamedPattern[],
): PatternMeta | null {
	const preset = presets.find((p) => p.id === id);
	if (preset) return { id, name: preset.name, source: "preset" };
	const custom = customs.find((p) => p.id === id);
	if (custom) return { id, name: custom.name, source: "custom" };
	return null;
}

// Pure: resolve a list of ids, dropping any that no longer resolve. Order of the
// input ids is preserved.
export function resolvePatternMetas(
	ids: string[],
	presets: NamedPattern[],
	customs: NamedPattern[],
): PatternMeta[] {
	return ids
		.map((id) => resolvePatternMeta(id, presets, customs))
		.filter((m): m is PatternMeta => m !== null);
}

// Upsert the user's last-opened pattern for a tool. No-op for guests: the table
// is account-scoped, and device-local recall already lives in localStorage.
export async function saveLastPattern(
	supabase: SupabaseClient,
	user: User | null,
	tool: PatternTool,
	patternId: string,
): Promise<void> {
	if (!user) return;
	const { error } = await supabase
		.from("user_last_pattern")
		.upsert(
			{ user_id: user.id, tool, pattern_id: patternId },
			{ onConflict: "user_id,tool" },
		);
	if (error) throw new Error(error.message);
}

// Load the last-opened pattern id per tool for the signed-in user. Returns an
// empty object for guests.
export async function loadLastPatterns(
	supabase: SupabaseClient,
	user: User | null,
): Promise<LastPatterns> {
	if (!user) return {};
	const { data, error } = await supabase
		.from("user_last_pattern")
		.select("tool, pattern_id")
		.eq("user_id", user.id);
	if (error) throw new Error(error.message);
	const result: LastPatterns = {};
	for (const row of data ?? []) {
		const tool = row.tool as PatternTool;
		if (tool === "strum" || tool === "fingerpick") {
			result[tool] = row.pattern_id as string;
		}
	}
	return result;
}
