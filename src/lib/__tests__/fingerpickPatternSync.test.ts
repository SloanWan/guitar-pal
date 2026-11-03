import { describe, expect, it } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { loadUserFingerpickPatterns, saveUserFingerpickPattern } from "@/lib/fingerpickPatternSync";

type Row = Record<string, unknown>;

/**
 * A `user_fingerpick_patterns` that keeps what is upserted and hands back only the
 * columns a select names — so a column the load forgets comes back missing, as it
 * would from the real table.
 */
function fakeTable(): SupabaseClient {
	const rows: Row[] = [];
	const client = {
		from: () => ({
			upsert: async (row: Row) => {
				const at = rows.findIndex((r) => r.pattern_id === row.pattern_id);
				const stored = { created_at: "2026-11-02T00:00:00Z", ...row };
				if (at === -1) rows.push(stored);
				else rows[at] = stored;
				return { error: null };
			},
			select: (columns: string) => ({
				eq: async () => {
					const names = columns.split(",").map((c) => c.trim());
					return { data: rows.map((r) => Object.fromEntries(names.map((n) => [n, r[n]]))), error: null };
				},
			}),
		}),
	};
	return client as unknown as SupabaseClient;
}

const user = { id: "u1" } as User;

describe("a signed-in player's tabs", () => {
	it("come back with the spans they were saved with", async () => {
		const preset = PRESET_FINGERPICK_PATTERNS[0];
		const slots = preset.measures[0].slots;
		const tab: FingerpickPattern = {
			...preset,
			id: "mine",
			spans: [{ id: "pm", kind: "palmMute", from: slots[0].id, to: slots[1].id }],
		};
		const supabase = fakeTable();
		await saveUserFingerpickPattern(supabase, user, tab);
		const [loaded] = await loadUserFingerpickPatterns(supabase, user);
		expect(loaded.spans).toEqual(tab.spans);
	});

	it("come back with their reference links, and without any when none were kept", async () => {
		const preset = PRESET_FINGERPICK_PATTERNS[0];
		const references = [{ id: "r1", url: "https://youtu.be/abc", label: "Official video" }];
		const supabase = fakeTable();
		await saveUserFingerpickPattern(supabase, user, { ...preset, id: "linked", references });
		await saveUserFingerpickPattern(supabase, user, { ...preset, id: "bare", references: [] });
		const loaded = await loadUserFingerpickPatterns(supabase, user);
		expect(loaded.find((p) => p.id === "linked")?.references).toEqual(references);
		expect(loaded.find((p) => p.id === "bare")).not.toHaveProperty("references");
	});
});
