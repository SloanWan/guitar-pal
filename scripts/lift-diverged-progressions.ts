// One-time migration (#363, Strum step 1): every chord progression now plays
// its pattern's rhythm, so a progression whose bars were re-written to a rhythm
// of their own is given that rhythm as a pattern of the player's, and moved onto
// it. Nothing changes how it sounds; it changes where the rhythm lives.
//
// The decision is `liftDivergedProgressions` in src/lib/strumStorage.ts — the
// same function the browser runs once over a guest's local library — so the two
// cannot disagree about which sequences move.
//
// Calibration, before anything is planned: the old model kept its own record of
// whether a sequence still followed its pattern (`synced_beats`,
// `follows_pattern`). Rows it recorded as plainly in step — still following, the
// snapshot equal to the pattern's rhythm, every bar playing it — must be judged
// as following here, and rows it recorded as declined with bars that differ must
// be judged as diverged. Any disagreement aborts the run. Every rhythm a lift
// would create must also reproduce its sequence bar for bar.
//
// Run with:
//   npx tsx scripts/lift-diverged-progressions.ts           # dry run: calibration + plan
//   npx tsx scripts/lift-diverged-progressions.ts --apply   # write, then re-verify
//
// Prerequisites:
//   - NEXT_PUBLIC_SUPABASE_URL in .env.local
//   - SUPABASE_SERVICE_ROLE_KEY in .env.local  (Dashboard → Settings → API → service_role)
//
// Safe to delete after a successful run.

import { config } from "dotenv";
import { resolve } from "path";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { Bar, Beat, ChordProgression, StrumPattern } from "../src/lib/strumPatterns";
import { PRESET_STRUM_PATTERNS } from "../src/lib/strumPatterns";
import { normalizeBars, normalizeBeats, validateBars } from "../src/lib/strumBars";
import { followsRhythm, patternRhythm, rhythmOfBars } from "../src/lib/strumRhythm";
import {
	liftDivergedProgressions,
	patternColumns,
	patternFromRow,
	type StrumPatternRow,
} from "../src/lib/strumStorage";

config({ path: resolve(process.cwd(), ".env.local") });

const APPLY = process.argv.includes("--apply");

interface PatternRow extends StrumPatternRow {
	user_id: string;
}

interface ProgressionRow {
	id: string;
	user_id: string;
	pattern_id: string;
	bars: unknown;
	order_index: number | null;
	name: string | null;
	synced_beats: unknown;
	follows_pattern: boolean | null;
}

function fail(message: string): never {
	console.error(`\n✗ ${message}`);
	process.exit(1);
}

function same(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
	const supabase = createClient(url, key, { auth: { persistSession: false } });

	const { data: patternRows, error: patternError } = await supabase.from("user_strum_patterns").select("*");
	if (patternError) fail(`reading patterns: ${patternError.message}`);
	const { data: progressionRows, error: progressionError } = await supabase
		.from("user_pattern_progressions")
		.select("*");
	if (progressionError) fail(`reading progressions: ${progressionError.message}`);

	const patternsByUser = new Map<string, StrumPattern[]>();
	for (const row of (patternRows ?? []) as PatternRow[]) {
		const list = patternsByUser.get(row.user_id) ?? [];
		list.push(patternFromRow(row));
		patternsByUser.set(row.user_id, list);
	}

	const progressionsByUser = new Map<string, ChordProgression[]>();
	const rawById = new Map<string, ProgressionRow>();
	let unreadable = 0;
	for (const row of (progressionRows ?? []) as ProgressionRow[]) {
		if (!validateBars(row.bars).ok) {
			unreadable++;
			continue;
		}
		rawById.set(row.id, row);
		const list = progressionsByUser.get(row.user_id) ?? [];
		list.push({
			id: row.id,
			patternId: row.pattern_id,
			bars: normalizeBars(row.bars as Bar[]),
			orderIndex: row.order_index ?? 0,
			name: row.name ?? "",
		});
		progressionsByUser.set(row.user_id, list);
	}
	console.log(
		`Read ${patternRows?.length ?? 0} patterns and ${progressionRows?.length ?? 0} progressions` +
			(unreadable ? ` (${unreadable} with unreadable bars, left alone)` : "") +
			".",
	);

	// ── Calibration ─────────────────────────────────────────────────────────
	let knownFollowing = 0;
	let knownDiverged = 0;
	for (const [userId, progressions] of progressionsByUser) {
		const known = [...PRESET_STRUM_PATTERNS, ...(patternsByUser.get(userId) ?? [])];
		for (const progression of progressions) {
			const pattern = known.find((p) => p.id === progression.patternId);
			const raw = rawById.get(progression.id);
			if (!pattern || !raw) continue;
			const rhythm = patternRhythm(pattern);
			const snapshot = Array.isArray(raw.synced_beats) ? normalizeBeats(raw.synced_beats as Beat[]) : null;
			const barsMatch = progression.bars.every((bar) => same(bar.beats, rhythm[0]));
			if (raw.follows_pattern !== false && snapshot && rhythm.length === 1 && same(snapshot, rhythm[0]) && barsMatch) {
				knownFollowing++;
				if (!followsRhythm(progression.bars, rhythm)) {
					fail(`calibration: ${progression.id} was recorded in step with ${pattern.id} but is judged diverged`);
				}
			}
			if (raw.follows_pattern === false && !barsMatch) {
				knownDiverged++;
				if (followsRhythm(progression.bars, rhythm)) {
					fail(`calibration: ${progression.id} was recorded as declined with its own rhythm but is judged following`);
				}
			}
		}
	}
	if (knownFollowing === 0) fail("calibration: no progression recorded as in step to check against — refusing to guess");
	console.log(
		`✓ Calibration: ${knownFollowing} recorded-in-step rows judged following` +
			(knownDiverged ? `, ${knownDiverged} recorded-declined rows judged diverged.` : " (no declined rows on record)."),
	);

	// ── Plan ────────────────────────────────────────────────────────────────
	const plan: { userId: string; patterns: StrumPattern[]; progressions: ChordProgression[] }[] = [];
	for (const [userId, progressions] of progressionsByUser) {
		const lift = liftDivergedProgressions(patternsByUser.get(userId) ?? [], progressions, randomUUID);
		for (const moved of lift.progressions) {
			const made = lift.patterns.find((p) => p.id === moved.patternId);
			if (!made || !followsRhythm(moved.bars, patternRhythm(made))) {
				fail(`round trip: the rhythm made for ${moved.id} does not reproduce its bars`);
			}
			if (!same(patternRhythm(made), rhythmOfBars(moved.bars))) {
				fail(`round trip: ${moved.id} was not given the shortest rhythm its bars repeat`);
			}
		}
		if (lift.patterns.length > 0) plan.push({ userId, ...lift });
	}

	const total = plan.reduce((n, p) => n + p.progressions.length, 0);
	console.log(`\n${total} progression(s) to move, across ${plan.length} player(s):`);
	for (const entry of plan) {
		for (const progression of entry.progressions) {
			const made = entry.patterns.find((p) => p.id === progression.patternId)!;
			const was = rawById.get(progression.id)?.pattern_id;
			console.log(
				`  ${entry.userId.slice(0, 8)}  ${progression.id.slice(0, 8)}  ${was} → "${made.name}" (${patternRhythm(made).length} bar rhythm)`,
			);
		}
	}
	if (!APPLY) {
		console.log("\nDry run — nothing written. Re-run with --apply to write.");
		return;
	}
	if (total === 0) return;

	// ── Write ───────────────────────────────────────────────────────────────
	for (const entry of plan) {
		const { error } = await supabase.from("user_strum_patterns").insert(
			entry.patterns.map((pattern) => ({ user_id: entry.userId, pattern_id: pattern.id, ...patternColumns(pattern) })),
		);
		if (error) fail(`inserting patterns for ${entry.userId}: ${error.message}`);
		for (const progression of entry.progressions) {
			const { error: moveError } = await supabase
				.from("user_pattern_progressions")
				.update({ pattern_id: progression.patternId })
				.eq("id", progression.id)
				.eq("user_id", entry.userId);
			if (moveError) fail(`moving ${progression.id}: ${moveError.message}`);
		}
	}

	// ── Re-verify ───────────────────────────────────────────────────────────
	const { data: after } = await supabase.from("user_strum_patterns").select("*");
	const { data: afterProgressions } = await supabase.from("user_pattern_progressions").select("*");
	const afterPatterns = ((after ?? []) as PatternRow[]).map((row) => ({ userId: row.user_id, pattern: patternFromRow(row) }));
	let stillDiverged = 0;
	for (const row of (afterProgressions ?? []) as ProgressionRow[]) {
		if (!validateBars(row.bars).ok) continue;
		const pattern =
			PRESET_STRUM_PATTERNS.find((p) => p.id === row.pattern_id) ??
			afterPatterns.find((p) => p.userId === row.user_id && p.pattern.id === row.pattern_id)?.pattern;
		if (pattern && !followsRhythm(normalizeBars(row.bars as Bar[]), patternRhythm(pattern))) stillDiverged++;
	}
	if (stillDiverged > 0) fail(`re-verify: ${stillDiverged} progression(s) still do not follow their pattern`);
	console.log(`\n✓ Wrote ${total} move(s); every progression now follows its pattern.`);
}

main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
