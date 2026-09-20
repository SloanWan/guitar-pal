// Audits every row of `chord_voicings` against its chord's formula (#229).
// Run after any chord-data import, and before opening a data PR:
//
//   npx tsx scripts/audit-chord-voicings.ts            # every failing row
//   npx tsx scripts/audit-chord-voicings.ts --standard # Standard rows only
//
// Reads through the anon key (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY in
// .env.local). Never writes. Exits 1 when a Standard row fails, so it can gate
// a migration; Variation failures are listed but do not fail the run.
//
// The rules, decided under #226/#229:
//   * Standard is the textbook shape — sounds every MUST tone, nothing outside
//     ALLOWED, and its lowest note is the root (a slash chord: the slashed bass).
//   * Variation is another way to hold it — MUST and ALLOWED only. Its bass is
//     free: inversions are normal on a guitar and stay; the UI names the bass.
//   * A Variation may leave out the root — the jazz comping shapes do — but only
//     when its `note` says so ("Rootless: …", written by #230's migration), so
//     the card tells the player. A Standard always sounds the root.
//   * Fingering is physically possible.
//
// A maintenance script, not a one-off: keep it. `checkVoicing` is also what a
// data migration calibrates its hand-written rows against before writing.

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const STANDARD_ONLY = process.argv.includes("--standard");

// ── Formulas ─────────────────────────────────────────────────────────────────
// Semitones from the root: 0 R · 1 ♭9 · 2 9 · 3 m3/♯9 · 4 M3 · 5 11 · 6 ♭5/♯11
// · 7 5 · 8 ♯5/♭13 · 9 6/13 · 10 ♭7 · 11 M7.
//
// `allowed`: the only tones the shape may sound. `must`: tones without which it
// is a different chord — each entry is a list of alternatives, any one of which
// satisfies it (maj11 wants an 11th, natural or sharp). The 5th is optional
// everywhere it is unaltered; a 9th is required where it names the chord.
// The table is the spec; change it here, not in the code below.

interface Formula {
	allowed: readonly number[];
	must: readonly (readonly number[])[];
}

const one = (...tones: number[]): (readonly number[])[] => tones.map((t) => [t]);

const FORMULAS: Record<string, Formula> = {
	// triads
	major: { allowed: [0, 4, 7], must: one(0, 4) },
	minor: { allowed: [0, 3, 7], must: one(0, 3) },
	dim: { allowed: [0, 3, 6], must: one(0, 3, 6) },
	aug: { allowed: [0, 4, 8], must: one(0, 4, 8) },
	"5": { allowed: [0, 7], must: one(0, 7) },
	// suspensions
	sus: { allowed: [0, 5, 7], must: one(0, 5) },
	sus4: { allowed: [0, 5, 7], must: one(0, 5) },
	sus2: { allowed: [0, 2, 7], must: one(0, 2) },
	sus2sus4: { allowed: [0, 2, 5, 7], must: one(0, 2, 5) },
	"7sus4": { allowed: [0, 5, 7, 10], must: one(0, 5, 10) },
	maj7sus2: { allowed: [0, 2, 7, 11], must: one(0, 2, 11) },
	// added tones and sixths
	add9: { allowed: [0, 2, 4, 7], must: one(0, 2, 4) },
	madd9: { allowed: [0, 2, 3, 7], must: one(0, 2, 3) },
	add11: { allowed: [0, 4, 5, 7], must: one(0, 4, 5) },
	"6": { allowed: [0, 4, 7, 9], must: one(0, 4, 9) },
	m6: { allowed: [0, 3, 7, 9], must: one(0, 3, 9) },
	"69": { allowed: [0, 2, 4, 7, 9], must: one(0, 2, 4, 9) },
	m69: { allowed: [0, 2, 3, 7, 9], must: one(0, 2, 3, 9) },
	// dominant family
	"7": { allowed: [0, 4, 7, 10], must: one(0, 4, 10) },
	"9": { allowed: [0, 2, 4, 7, 10], must: one(0, 2, 4, 10) },
	"11": { allowed: [0, 2, 4, 5, 7, 10], must: one(0, 5, 10) },
	"13": { allowed: [0, 2, 4, 5, 7, 9, 10], must: one(0, 4, 9, 10) },
	"7b5": { allowed: [0, 4, 6, 10], must: one(0, 4, 6, 10) },
	"9b5": { allowed: [0, 2, 4, 6, 10], must: one(0, 2, 4, 6, 10) },
	aug7: { allowed: [0, 4, 8, 10], must: one(0, 4, 8, 10) },
	aug9: { allowed: [0, 2, 4, 8, 10], must: one(0, 2, 4, 8, 10) },
	"7b9": { allowed: [0, 1, 4, 7, 10], must: one(0, 1, 4, 10) },
	"7#9": { allowed: [0, 3, 4, 7, 10], must: one(0, 3, 4, 10) },
	// Upstream drops the 9th from half its 9#11 shapes (a 7#11 in all but name).
	"9#11": { allowed: [0, 2, 4, 6, 7, 10], must: one(0, 4, 6, 10) },
	// Not the jazz altered dominant: in this library "alt" is the major ♭5 triad,
	// 47 of 48 upstream shapes. Renaming the suffix is a separate decision.
	alt: { allowed: [0, 4, 6], must: one(0, 4, 6) },
	// major-seventh family
	maj7: { allowed: [0, 4, 7, 11], must: one(0, 4, 11) },
	maj9: { allowed: [0, 2, 4, 7, 11], must: one(0, 2, 4, 11) },
	maj11: { allowed: [0, 2, 4, 5, 6, 7, 11], must: [...one(0, 11), [5, 6]] },
	maj13: { allowed: [0, 2, 4, 5, 6, 7, 9, 11], must: one(0, 4, 9, 11) },
	"maj7b5": { allowed: [0, 4, 6, 11], must: one(0, 4, 6, 11) },
	"maj7#5": { allowed: [0, 4, 8, 11], must: one(0, 4, 8, 11) },
	// minor-seventh family
	m7: { allowed: [0, 3, 7, 10], must: one(0, 3, 10) },
	m9: { allowed: [0, 2, 3, 7, 10], must: one(0, 2, 3, 10) },
	m11: { allowed: [0, 2, 3, 5, 7, 10], must: one(0, 3, 5, 10) },
	"m7b5": { allowed: [0, 3, 6, 10], must: one(0, 3, 6, 10) },
	dim7: { allowed: [0, 3, 6, 9], must: one(0, 3, 6, 9) },
	mmaj7: { allowed: [0, 3, 7, 11], must: one(0, 3, 11) },
	mmaj9: { allowed: [0, 2, 3, 7, 11], must: one(0, 2, 3, 11) },
	mmaj11: { allowed: [0, 2, 3, 5, 7, 11], must: one(0, 3, 5, 11) },
	"mmaj7b5": { allowed: [0, 3, 6, 11], must: one(0, 3, 6, 11) },
};

// The suffix before the slash, as the tables spell it.
const SLASH_BASE: Record<string, string> = { "": "major", m: "minor" };

// ── Pitch arithmetic ─────────────────────────────────────────────────────────

const OPEN_MIDI = [40, 45, 50, 55, 59, 64] as const;
const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PITCH_CLASS: Record<string, number> = {
	C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
	G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

export interface VoicingRow {
	id: string;
	label: string | null;
	start_fret: number;
	barre_fret: number | null;
	frets: string;
	fingers: string;
	note: string | null;
	chords: { root: string; suffix: string };
}

const ROOTLESS_NOTE = /^Rootless\b/;

/** Absolute frets, low E first; -1 muted, 0 open. */
export function absoluteFrets(v: VoicingRow): number[] {
	return Array.from({ length: 6 }, (_, i) => {
		const c = v.frets[i];
		if (c === "x") return -1;
		const rel = parseInt(c, 10);
		return rel === 0 ? 0 : v.start_fret - 1 + rel;
	});
}

function soundingMidi(abs: readonly number[]): number[] {
	return abs.flatMap((f, i) => (f < 0 ? [] : [OPEN_MIDI[i] + f]));
}

export function fmt(abs: readonly number[]): string {
	const parts = abs.map((f) => (f < 0 ? "x" : String(f)));
	return abs.some((f) => f >= 10) ? parts.join("-") : parts.join("");
}

// ── Checks ───────────────────────────────────────────────────────────────────

export interface Finding {
	section: "bass" | "formula" | "fingering";
	chord: string;
	label: string;
	shape: string;
	problem: string;
	standard: boolean;
}

export function checkVoicing(v: VoicingRow): Finding[] {
	const { root, suffix } = v.chords;
	const chord = `${root} ${suffix}`;
	const label = v.label ?? "—";
	const abs = absoluteFrets(v);
	const shape = fmt(abs);
	const standard = v.label === "Standard";
	const findings: Finding[] = [];
	const add = (section: Finding["section"], problem: string) =>
		findings.push({ section, chord, label, shape, problem, standard });

	const rootPc = PITCH_CLASS[root];
	if (rootPc === undefined) {
		add("formula", `unknown root ${root}`);
		return findings;
	}

	const midi = soundingMidi(abs);
	if (midi.length === 0) {
		add("formula", "sounds nothing");
		return findings;
	}
	const relative = new Set(midi.map((m) => (((m - rootPc) % 12) + 12) % 12));
	const noteName = (rel: number) => NOTE[(rootPc + rel) % 12];

	// The formula, with a slash chord's bass folded in.
	const slash = suffix.indexOf("/");
	const baseSuffix = slash === -1 ? suffix : (SLASH_BASE[suffix.slice(0, slash)] ?? suffix.slice(0, slash));
	const slashBassPc = slash === -1 ? null : PITCH_CLASS[suffix.slice(slash + 1)];
	const formula = FORMULAS[baseSuffix];
	if (!formula) {
		add("formula", `no formula for suffix "${suffix}"`);
		return findings;
	}
	if (slash !== -1 && slashBassPc === undefined) {
		add("formula", `unknown slash bass in "${suffix}"`);
		return findings;
	}

	// Formula: nothing foreign, every must-tone present.
	const allowed = new Set(formula.allowed);
	if (slashBassPc != null) allowed.add((((slashBassPc - rootPc) % 12) + 12) % 12);
	const foreign = [...relative].filter((rel) => !allowed.has(rel));
	if (foreign.length > 0) add("formula", `sounds ${foreign.map(noteName).join(" ")}, not in ${suffix}`);
	// A Variation that says it is rootless is held to that, both ways.
	const rootless = !standard && ROOTLESS_NOTE.test(v.note ?? "");
	if (rootless && relative.has(0)) add("formula", "noted as rootless but sounds the root");
	const missing = formula.must.filter((alts) => !alts.some((rel) => relative.has(rel)));
	const unexcused = rootless ? missing.filter((alts) => !(alts.length === 1 && alts[0] === 0)) : missing;
	if (unexcused.length > 0) {
		const hint = !standard && unexcused.some((alts) => alts[0] === 0) ? " (a rootless Variation must say so in `note`)" : "";
		add("formula", `missing ${unexcused.map((alts) => alts.map(noteName).join("/")).join(", ")}${hint}`);
	}

	// Bass: the root under a Standard; the slashed note under any slash voicing.
	const bassPc = Math.min(...midi) % 12;
	if (slashBassPc != null) {
		if (bassPc !== slashBassPc) add("bass", `bass is ${NOTE[bassPc]}, the slash says ${NOTE[slashBassPc]}`);
	} else if (standard && bassPc !== rootPc) {
		add("bass", `bass is ${NOTE[bassPc]}, not the root`);
	}

	// Fingering: physically possible.
	const fingers = Array.from({ length: 6 }, (_, i) => parseInt(v.fingers[i], 10) || 0);
	const fretOfFinger = new Map<number, Set<number>>();
	abs.forEach((fret, i) => {
		const finger = fingers[i];
		const string = 6 - i;
		if (fret <= 0 && finger > 0) add("fingering", `finger ${finger} on ${fret < 0 ? "muted" : "open"} string ${string}`);
		if (fret > 0 && finger === 0) add("fingering", `no finger on fretted string ${string}`);
		if (fret > 0 && finger > 0) {
			if (!fretOfFinger.has(finger)) fretOfFinger.set(finger, new Set());
			fretOfFinger.get(finger)!.add(fret);
		}
	});
	for (const [finger, frets] of fretOfFinger) {
		if (frets.size > 1) add("fingering", `finger ${finger} on frets ${[...frets].sort((a, b) => a - b).join(" and ")}`);
	}
	const lowest = [...fretOfFinger].map(([finger, frets]) => [finger, Math.min(...frets)] as const);
	if (lowest.some(([fa, ta]) => lowest.some(([fb, tb]) => fa < fb && ta > tb))) {
		add("fingering", "finger order runs against fret order");
	}
	const fretted = abs.filter((f) => f > 0);
	if (fretted.length > 0 && Math.max(...fretted) - Math.min(...fretted) > 4) {
		add("fingering", `spans ${Math.max(...fretted) - Math.min(...fretted)} frets`);
	}
	if (v.barre_fret !== null) {
		const barreAbs = v.start_fret - 1 + v.barre_fret;
		if (abs.filter((f) => f === barreAbs).length < 2) add("fingering", "barre fret held by fewer than two strings");
	}

	return findings;
}

// ── Data access ──────────────────────────────────────────────────────────────

async function fetchVoicings(): Promise<VoicingRow[]> {
	const rows: VoicingRow[] = [];
	// PostgREST caps a response at 1000 rows and says nothing; page explicitly.
	for (let from = 0; ; from += 1000) {
		const res = await fetch(
			`${SUPABASE_URL}/rest/v1/chord_voicings?select=id,label,start_fret,barre_fret,frets,fingers,note,chords(root,suffix)&order=id`,
			{ headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY}`, Range: `${from}-${from + 999}` } },
		);
		if (!res.ok) throw new Error(`Fetching voicings: HTTP ${res.status}`);
		const page = (await res.json()) as VoicingRow[];
		rows.push(...page);
		if (page.length < 1000) break;
	}
	if (rows.length < 2000) throw new Error(`Only ${rows.length} voicings came back — expected the whole table.`);
	return rows;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	if (!SUPABASE_URL || !ANON_KEY) {
		console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
		process.exit(1);
	}
	const rows = await fetchVoicings();
	const findings = rows.flatMap(checkVoicing).filter((f) => !STANDARD_ONLY || f.standard);
	const standards = rows.filter((r) => r.label === "Standard").length;
	console.log(`${rows.length} voicings (${standards} Standard) checked.\n`);

	for (const section of ["bass", "formula", "fingering"] as const) {
		const here = findings.filter((f) => f.section === section);
		const failingStandard = new Set(here.filter((f) => f.standard).map((f) => f.chord)).size;
		console.log(`## ${section} — ${here.length} findings, ${failingStandard} on a Standard`);
		for (const f of here.sort((a, b) => Number(b.standard) - Number(a.standard) || a.chord.localeCompare(b.chord))) {
			console.log(`  ${f.chord.padEnd(14)} ${f.label.padEnd(12)} ${f.shape.padEnd(16)} ${f.problem}`);
		}
		console.log();
	}

	const failing = new Set(findings.filter((f) => f.standard).map((f) => f.chord));
	if (failing.size > 0) {
		console.error(`${failing.size} Standard voicings fail.`);
		process.exit(1);
	}
	console.log("Every Standard voicing passes.");
}

if (require.main === module) {
	main().catch((err: unknown) => {
		console.error(err);
		process.exit(1);
	});
}
