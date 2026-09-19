// One-time migration (#226): put the root in the bass of default voicings that
// lost it in the upstream data.
//
// The `Standard` voicing is what the chord page shows first and what the strum
// engine plays for a bare chord name. 50 of them (Bm `224432` is the poster
// case: the low E barred along, so F# sounds under a B minor) have a lowest
// note that is not the root. Two fixes are safe enough to script; the rest is
// printed for a hand pass and left alone.
//
//   A. Mute the low E. Taken when the root then lands in the bass and either the
//      muted string's note is still sounded elsewhere in the shape, or the result
//      is exactly ChordPro's shape (B maj9 `x2132x` drops its only fifth, which a
//      maj9 voicing commonly does). Eb m69 `2x1311` fails both — its only minor
//      third is on the low E and ChordPro has no entry.
//   B. Relabel: another stored voicing of the chord already has the root in the
//      bass, and it is the shape ChordPro's hand-written chord table gives for
//      that chord. Labels swap, rows keep their ids, so a progression pinned to
//      either voicing keeps playing what it played.
//   C. Hand-written: three chords whose stored shapes are wrong or sit high on
//      the neck get a new Standard row typed in below; the old Standard becomes
//      the next Variation.
//   D. Relabel, unvouched: the lowest root-in-bass variation, when it sits at or
//      below the 7th fret and keeps the third the Standard sounded (if the
//      Standard sounded the root at all). ChordPro has
//      no entry or a different (equally fine) shape for these; each was checked
//      by ear and by note before this rule was written.
//
// ChordPro is the second opinion: every A row is listed with whether ChordPro
// agrees, and B is only taken on agreement. ChordPro has errors of its own (its
// Ebsus2 `x11341` has a Bb in the bass), so it never decides alone.
//
// Run with:
//   npx tsx scripts/fix-default-voicing-bass.ts           # dry run: plan + calibration
//   npx tsx scripts/fix-default-voicing-bass.ts --apply   # write, then re-verify
//
// Prerequisites:
//   - NEXT_PUBLIC_SUPABASE_URL in .env.local
//   - SUPABASE_SERVICE_ROLE_KEY in .env.local  (Dashboard → Settings → API → service_role)
//
// Safe to delete after a successful run.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

// ── Env validation ───────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
	console.error(
		"Missing required env vars. Add NEXT_PUBLIC_SUPABASE_URL and " +
			"SUPABASE_SERVICE_ROLE_KEY to .env.local.",
	);
	process.exit(1);
}

const APPLY = process.argv.includes("--apply");

// ── Sources ──────────────────────────────────────────────────────────────────

// Pinned to the last commit that touched the file (2026-03-21) so a re-run
// reads the same second opinion.
const CHORDPRO_JSON_URL =
	"https://raw.githubusercontent.com/ChordPro/chordpro/badfdaac697580ff00ebfd0e3adf71cf26c32b56/lib/ChordPro/res/config/guitar.json";

// ── Types ────────────────────────────────────────────────────────────────────

interface VoicingRow {
	id: string;
	label: string | null;
	start_fret: number;
	barre_fret: number | null;
	capo: boolean;
	frets: string;
	fingers: string;
}

interface ChordRow {
	id: string;
	root: string;
	suffix: string;
	chord_voicings: VoicingRow[];
}

// ChordPro: `frets` low E → high e, -1 muted, else fret relative to `base`
// (1 = at base); `copy` entries alias another name.
interface ChordProChord {
	name: string;
	base?: number;
	frets?: number[];
	copy?: string;
}

interface ChordProJson {
	chords: ChordProChord[];
}

// ── Pitch arithmetic ─────────────────────────────────────────────────────────

const OPEN_MIDI = [40, 45, 50, 55, 59, 64] as const;
const ROOT_PC: Record<string, number> = {
	C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
	G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

/** Absolute frets, low E first; -1 muted, 0 open. */
function absoluteFrets(v: Pick<VoicingRow, "frets" | "start_fret">): number[] {
	return Array.from({ length: 6 }, (_, i) => {
		const c = v.frets[i];
		if (c === "x") return -1;
		const rel = parseInt(c, 10);
		return rel === 0 ? 0 : v.start_fret - 1 + rel;
	});
}

function pitchClasses(abs: readonly number[]): Set<number> {
	return new Set(abs.flatMap((f, i) => (f < 0 ? [] : [(OPEN_MIDI[i] + f) % 12])));
}

function bassPitchClass(abs: readonly number[]): number | null {
	const notes = abs.flatMap((f, i) => (f < 0 ? [] : [OPEN_MIDI[i] + f]));
	return notes.length > 0 ? Math.min(...notes) % 12 : null;
}

function sameShape(a: readonly number[], b: readonly number[]): boolean {
	return a.length === b.length && a.every((f, i) => f === b[i]);
}

function fmt(abs: readonly number[]): string {
	const parts = abs.map((f) => (f < 0 ? "x" : String(f)));
	return abs.some((f) => f >= 10) ? parts.join("-") : parts.join("");
}

// ── ChordPro lookup ──────────────────────────────────────────────────────────

// Project suffix → ChordPro suffix where the spelling differs.
const CHORDPRO_SUFFIX: Record<string, string> = {
	major: "",
	minor: "m",
	"69": "6(add9)",
	madd9: "m(add9)",
	mmaj7: "m(maj7)",
	aug7: "+7",
};

function buildChordProLookup(data: ChordProJson): (root: string, suffix: string) => number[] | null {
	const byName = new Map(data.chords.map((c) => [c.name, c]));
	return (root, suffix) => {
		let c = byName.get(root + (CHORDPRO_SUFFIX[suffix] ?? suffix));
		while (c?.copy) c = byName.get(c.copy);
		if (!c?.frets || c.base === undefined) return null;
		const base = c.base;
		return c.frets.map((f) => (f < 0 ? -1 : f === 0 ? 0 : base - 1 + f));
	};
}

// ── Hand-written voicings ────────────────────────────────────────────────────
// Same encoding as the table: frets/fingers low E first, digits relative to
// start_fret, "x" muted, "0" open.

interface HandVoicing {
	root: string;
	suffix: string;
	start_fret: number;
	frets: string;
	fingers: string;
	barre_fret: number | null;
	why: string;
}

const HAND_VOICINGS: HandVoicing[] = [
	// E B F# G B F# — the stored Standard xx3113 (F G# C G) is not an E chord at all.
	{ root: "E", suffix: "madd9", start_fret: 1, frets: "024002", fingers: "013002", barre_fret: null, why: "stored Standard sounds F G# C G" },
	// E B E F# B E — ChordPro's open shape; the stored root-bass variation is at the 7th fret.
	{ root: "E", suffix: "sus2", start_fret: 1, frets: "024400", fingers: "013400", barre_fret: null, why: "open shape, per ChordPro" },
	// Eb Bb Eb F Bb Eb — A-shape sus2 barre; the stored root-bass variation is at the 11th, ChordPro's x11341 has Bb in the bass.
	{ root: "Eb", suffix: "sus2", start_fret: 6, frets: "x13311", fingers: "013411", barre_fret: 1, why: "A-shape barre at 6" },
];

// ── Plan ─────────────────────────────────────────────────────────────────────

function standardOf(chord: ChordRow): VoicingRow {
	return (
		chord.chord_voicings.find((v) => v.label === "Standard") ??
		chord.chord_voicings.reduce((min, v) => (v.start_fret < min.start_fret ? v : min))
	);
}

interface MuteFix {
	kind: "mute-low-e";
	chord: string;
	row: VoicingRow;
	frets: string;
	fingers: string;
	chordProAgrees: boolean;
}

interface RelabelFix {
	kind: "relabel";
	chord: string;
	standard: VoicingRow;
	replacement: VoicingRow;
}

interface InsertFix {
	kind: "insert";
	chord: string;
	chordId: string;
	standard: VoicingRow;
	demoteTo: string;
	row: HandVoicing;
}

interface ReviewItem {
	chord: string;
	standard: VoicingRow;
	bass: number;
	chordPro: number[] | null;
	reason: string;
}

interface Plan {
	mutes: MuteFix[];
	relabels: RelabelFix[];
	inserts: InsertFix[];
	unvouched: RelabelFix[];
	review: ReviewItem[];
	flagged: number;
	chords: number;
}

const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function buildPlan(
	chords: readonly ChordRow[],
	chordPro: (root: string, suffix: string) => number[] | null,
): Plan {
	const plan: Plan = { mutes: [], relabels: [], inserts: [], unvouched: [], review: [], flagged: 0, chords: 0 };

	for (const chord of chords) {
		if (chord.suffix.includes("/")) continue; // a slash chord's bass is the point
		plan.chords++;
		const rootPc = ROOT_PC[chord.root];
		if (rootPc === undefined) throw new Error(`Unknown root ${chord.root}`);

		const std = standardOf(chord);
		const abs = absoluteFrets(std);
		const bass = bassPitchClass(abs);
		if (bass === null || bass === rootPc) continue;
		plan.flagged++;

		const name = `${chord.root} ${chord.suffix}`;
		const cp = chordPro(chord.root, chord.suffix);

		// A. Mute the low E, if that loses no note and puts the root underneath.
		if (abs[0] >= 0) {
			const muted = [-1, ...abs.slice(1)];
			const lostNote = !pitchClasses(muted).has((OPEN_MIDI[0] + abs[0]) % 12);
			const chordProAgrees = cp !== null && sameShape(cp, muted);
			if ((!lostNote || chordProAgrees) && bassPitchClass(muted) === rootPc) {
				plan.mutes.push({
					kind: "mute-low-e",
					chord: name,
					row: std,
					frets: "x" + std.frets.slice(1),
					fingers: "0" + std.fingers.slice(1),
					chordProAgrees,
				});
				continue;
			}
		}

		// B. Another voicing has the root in the bass and is ChordPro's shape.
		const replacement = chord.chord_voicings.find((v) => {
			if (v.id === std.id) return false;
			const a = absoluteFrets(v);
			return bassPitchClass(a) === rootPc && cp !== null && sameShape(a, cp);
		});
		if (replacement) {
			plan.relabels.push({ kind: "relabel", chord: name, standard: std, replacement });
			continue;
		}

		// C. A hand-written Standard.
		const hand = HAND_VOICINGS.find((h) => h.root === chord.root && h.suffix === chord.suffix);
		if (hand) {
			const handAbs = absoluteFrets(hand);
			if (bassPitchClass(handAbs) !== rootPc) throw new Error(`Hand voicing for ${name} does not put the root in the bass`);
			plan.inserts.push({
				kind: "insert",
				chord: name,
				chordId: chord.id,
				standard: std,
				demoteTo: `Variation ${chord.chord_voicings.length + 1}`,
				row: hand,
			});
			continue;
		}

		// D. The lowest root-in-bass variation, low on the neck, third intact.
		// A Standard that does not even sound the root (C# 9#11 `x32003` is a
		// Cmaj7) has no quality worth preserving.
		const stdPcs = pitchClasses(abs);
		const thirds = new Set([3, 4].map((i) => (rootPc + i) % 12));
		const stdThird = stdPcs.has(rootPc) ? [...stdPcs].find((pc) => thirds.has(pc)) : undefined;
		const rootBassAlts = chord.chord_voicings
			.filter((v) => v.id !== std.id && bassPitchClass(absoluteFrets(v)) === rootPc)
			.sort((a, b) => a.start_fret - b.start_fret);
		const low = rootBassAlts[0];
		if (low && low.start_fret <= 7 && (stdThird === undefined || pitchClasses(absoluteFrets(low)).has(stdThird))) {
			plan.unvouched.push({ kind: "relabel", chord: name, standard: std, replacement: low });
			continue;
		}

		const rootBassAlt = rootBassAlts[0];
		plan.review.push({
			chord: name,
			standard: std,
			bass,
			chordPro: cp,
			reason: rootBassAlt
				? `${rootBassAlt.label} ${fmt(absoluteFrets(rootBassAlt))} has the root in the bass but ChordPro ${cp ? `gives ${fmt(cp)}` : "has no entry"}`
				: abs[0] >= 0 && bassPitchClass([-1, ...abs.slice(1)]) === rootPc
					? "muting the low E would drop a note only it sounds, and ChordPro does not vouch for that"
					: "no stored voicing has the root in the bass",
		});
	}

	return plan;
}

// ── Calibration ──────────────────────────────────────────────────────────────
// Known rows, verified by hand: Bm must become x24432, and Ab 7's Standard
// must hand its label to Variation 2 (131211 @4, the E-shape barre).

function calibrate(plan: Plan): boolean {
	let ok = true;
	const bm = plan.mutes.find((m) => m.chord === "B minor");
	if (!bm || bm.frets !== "x24432" || bm.fingers !== "013421" || !bm.chordProAgrees) {
		console.error("  [FAIL] B minor: expected mute-low-e → x24432 / 013421 with ChordPro agreeing, got", bm);
		ok = false;
	}
	const ab7 = plan.relabels.find((r) => r.chord === "Ab 7");
	if (!ab7 || ab7.replacement.label !== "Variation 2" || ab7.replacement.frets !== "131211" || ab7.replacement.start_fret !== 4) {
		console.error("  [FAIL] Ab 7: expected relabel → Variation 2 (131211 @4), got", ab7);
		ok = false;
	}
	const bmaj9 = plan.mutes.find((m) => m.chord === "B maj9");
	if (!bmaj9 || bmaj9.frets !== "x2132x" || !bmaj9.chordProAgrees) {
		console.error("  [FAIL] B maj9: expected mute-low-e → x2132x on ChordPro's word (it drops the only fifth), got", bmaj9);
		ok = false;
	}
	if (plan.mutes.some((m) => m.chord === "Eb m69")) {
		console.error("  [FAIL] Eb m69: muting its low E drops the only minor third; it must not be a mute.");
		ok = false;
	}
	const ebm69 = plan.unvouched.find((r) => r.chord === "Eb m69");
	if (!ebm69 || ebm69.replacement.frets !== "x3123x" || ebm69.replacement.start_fret !== 4) {
		console.error("  [FAIL] Eb m69: expected unvouched relabel → x3123x @4 (Eb Gb C F), got", ebm69);
		ok = false;
	}
	const emadd9 = plan.inserts.find((i) => i.chord === "E madd9");
	if (!emadd9 || emadd9.row.frets !== "024002") {
		console.error("  [FAIL] E madd9: expected a hand-written 024002, got", emadd9);
		ok = false;
	}
	if (plan.review.length !== 1 || plan.review[0].chord !== "C 7sg") {
		console.error("  [FAIL] Only C 7sg should be left for a hand pass, got", plan.review.map((r) => r.chord));
		ok = false;
	}
	return ok;
}

// ── Reporting ────────────────────────────────────────────────────────────────

function printPlan(plan: Plan): void {
	console.log(`\n${plan.flagged} of ${plan.chords} chords have a default voicing whose bass is not the root.\n`);

	console.log(`A. Mute the low E (${plan.mutes.length}):`);
	for (const m of plan.mutes) {
		console.log(
			`  ${m.chord.padEnd(12)} ${m.row.frets} @${String(m.row.start_fret).padEnd(2)} → ${m.frets} / ${m.fingers}   ${m.chordProAgrees ? "ChordPro agrees" : "(ChordPro differs or absent)"}`,
		);
	}

	console.log(`\nB. Relabel — the ChordPro shape is already a stored variation (${plan.relabels.length}):`);
	for (const r of plan.relabels) {
		console.log(
			`  ${r.chord.padEnd(12)} Standard ${r.standard.frets} @${String(r.standard.start_fret).padEnd(2)} ⇄ ${r.replacement.label} ${r.replacement.frets} @${r.replacement.start_fret}`,
		);
	}

	console.log(`\nC. Hand-written Standard (${plan.inserts.length}):`);
	for (const i of plan.inserts) {
		console.log(
			`  ${i.chord.padEnd(12)} insert ${i.row.frets} @${String(i.row.start_fret).padEnd(2)} (${i.row.why}); old Standard ${i.standard.frets} @${i.standard.start_fret} → ${i.demoteTo}`,
		);
	}

	console.log(`\nD. Relabel, unvouched — lowest root-in-bass variation (${plan.unvouched.length}):`);
	for (const r of plan.unvouched) {
		console.log(
			`  ${r.chord.padEnd(12)} Standard ${r.standard.frets} @${String(r.standard.start_fret).padEnd(2)} ⇄ ${r.replacement.label} ${r.replacement.frets} @${String(r.replacement.start_fret).padEnd(2)} = ${fmt(absoluteFrets(r.replacement))}`,
		);
	}

	console.log(`\nE. Left for a hand pass (${plan.review.length}):`);
	for (const item of plan.review) {
		const abs = absoluteFrets(item.standard);
		console.log(
			`  ${item.chord.padEnd(12)} ${fmt(abs).padEnd(14)} bass ${NOTE[item.bass].padEnd(3)} ChordPro: ${(item.chordPro ? fmt(item.chordPro) : "—").padEnd(14)} ${item.reason}`,
		);
	}
}

// ── Data access ──────────────────────────────────────────────────────────────

async function fetchChords(supabase: SupabaseClient): Promise<ChordRow[]> {
	const { data, error } = await supabase
		.from("chords")
		.select("id, root, suffix, chord_voicings ( id, label, start_fret, barre_fret, capo, frets, fingers )")
		.order("root")
		.order("suffix");
	if (error) throw new Error(`Fetching chords: ${error.message}`);
	const rows = data as ChordRow[];
	if (rows.length < 500) throw new Error(`Only ${rows.length} chords came back — expected the whole table.`);
	return rows;
}

async function applyPlan(supabase: SupabaseClient, plan: Plan): Promise<void> {
	for (const m of plan.mutes) {
		const { error } = await supabase
			.from("chord_voicings")
			.update({ frets: m.frets, fingers: m.fingers, capo: false })
			.eq("id", m.row.id);
		if (error) throw new Error(`Updating ${m.chord} (${m.row.id}): ${error.message}`);
	}
	for (const i of plan.inserts) {
		const demote = await supabase
			.from("chord_voicings")
			.update({ label: i.demoteTo })
			.eq("id", i.standard.id);
		if (demote.error) throw new Error(`Demoting ${i.chord} Standard: ${demote.error.message}`);
		const { start_fret, frets, fingers, barre_fret } = i.row;
		const insert = await supabase
			.from("chord_voicings")
			.insert({ chord_id: i.chordId, label: "Standard", capo: false, start_fret, frets, fingers, barre_fret });
		if (insert.error) throw new Error(`Inserting ${i.chord} Standard: ${insert.error.message}`);
	}
	for (const r of [...plan.relabels, ...plan.unvouched]) {
		// Two updates, not one swap: `label` has no uniqueness constraint, so the
		// brief moment with two "Standard" rows is harmless.
		const first = await supabase
			.from("chord_voicings")
			.update({ label: r.replacement.label })
			.eq("id", r.standard.id);
		if (first.error) throw new Error(`Relabeling ${r.chord} Standard: ${first.error.message}`);
		const second = await supabase
			.from("chord_voicings")
			.update({ label: "Standard" })
			.eq("id", r.replacement.id);
		if (second.error) throw new Error(`Relabeling ${r.chord} ${r.replacement.label}: ${second.error.message}`);
	}
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);

	console.log("Fetching ChordPro guitar.json …");
	const res = await fetch(CHORDPRO_JSON_URL);
	if (!res.ok) throw new Error(`Failed to fetch ChordPro guitar.json: HTTP ${res.status}`);
	const chordPro = buildChordProLookup((await res.json()) as ChordProJson);

	console.log("Fetching chords + voicings …");
	const chords = await fetchChords(supabase);
	console.log(`  ${chords.length} chords, ${chords.reduce((n, c) => n + c.chord_voicings.length, 0)} voicings.`);

	const plan = buildPlan(chords, chordPro);
	printPlan(plan);

	console.log("\nCalibrating against known rows …");
	if (!calibrate(plan)) {
		console.error("Calibration FAILED — nothing written.");
		process.exit(1);
	}
	console.log("  OK.");

	if (!APPLY) {
		console.log("\nDry run. Re-run with --apply to write A–D.");
		return;
	}

	console.log(
		`\nApplying ${plan.mutes.length} mutes, ${plan.relabels.length + plan.unvouched.length} relabels and ${plan.inserts.length} inserts …`,
	);
	await applyPlan(supabase, plan);

	console.log("Re-verifying …");
	const after = buildPlan(await fetchChords(supabase), chordPro);
	const remaining = after.mutes.length + after.relabels.length + after.inserts.length + after.unvouched.length;
	if (remaining > 0) {
		console.error(`  [FAIL] ${remaining} scriptable rows still flagged after the write.`);
		process.exit(1);
	}
	console.log(`  Done. ${after.flagged} defaults still have a non-root bass — all in the hand-pass list above.`);
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
