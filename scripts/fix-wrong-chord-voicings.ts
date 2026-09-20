// One-time migration (#230, closes #63): fix or drop the voicings the audit
// (scripts/audit-chord-voicings.ts, #229) flagged after #226.
//
// Seven Standard voicings sound a different chord from the one they are named;
// about a hundred Variations have a foreign note, lack a must-tone, or carry a
// `fingers` string no hand can play. Every decision is a hand-written row in
// the tables below — nothing here is inferred — and each falls into one of:
//
//   replace  the shape is wrong; a new shape is written into the same row, so
//            a progression pinned to its id keeps playing (now the right chord).
//            A shape written by hand rather than taken from a published table
//            says so in `note`, so the player knows to trust their ear.
//   fingers  the shape is fine; only `fingers` / `barre_fret` change.
//   rootless the shape sounds the chord minus its root — a jazz comping shape.
//            Kept as it is, with a `note` saying so; the audit accepts a
//            rootless Variation only when the note is there.
//   delete   a wrong-chord Variation (no third, foreign notes) with no sensible
//            one-note fix. Refused when any user data pins the id.
//   reparent the "C 7sg" rows (#63): `7sg` is not a suffix; the shapes are C7
//            inversions. Two move under `C 7` as new Variations, the one that
//            duplicates an existing C7 row is deleted, then the chord row goes.
//
// After deletes, a chord's remaining Variations are renumbered 2… so the cards
// read in sequence. Variation labels are display only; nothing stores them.
//
// Needs the `note` column: run scripts/add-chord-voicing-note.sql first.
//
// Calibration (runs on every invocation, before any write):
//   * every targeted row must still be the chord, label and shape the table
//     says it is — the table was written against the live data on 2026-09-20;
//   * every written row must sound exactly the notes the table claims, and pass
//     the audit's own `checkVoicing` with no findings. That is the check on the
//     hand-written shapes: a wrong fret or finger aborts the run.
//
// Run with:
//   npx tsx scripts/fix-wrong-chord-voicings.ts           # dry run: plan + calibration
//   npx tsx scripts/fix-wrong-chord-voicings.ts --apply   # write, then re-verify
//
// Prerequisites:
//   - NEXT_PUBLIC_SUPABASE_URL in .env.local
//   - SUPABASE_SERVICE_ROLE_KEY in .env.local  (Dashboard → Settings → API → service_role)
//
// Afterwards `npx tsx scripts/audit-chord-voicings.ts --standard` must exit 0.
// Safe to delete after a successful run.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { absoluteFrets, checkVoicing, type VoicingRow } from "./audit-chord-voicings";

config({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
	console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local.");
	process.exit(1);
}

const APPLY = process.argv.includes("--apply");

// ── The plan ─────────────────────────────────────────────────────────────────
// Shapes are absolute frets, low E first, -1 muted. `barre` is an absolute fret
// or null. `sounds` is the pitch-class set the new shape must produce, spelled
// in sharps as the audit spells them — the calibration recomputes it.

interface Replace {
	kind: "replace";
	id: string;
	chord: string;
	label: string;
	was: string;
	shape: readonly number[];
	fingers: string;
	barre: number | null;
	sounds: string;
	why: string;
	/** Set when the shape is this script's own, not a published grip. */
	note?: string;
}

interface Fingers {
	kind: "fingers";
	id: string;
	chord: string;
	label: string;
	was: string;
	fingers: string;
	barre: number | null;
}

interface Rootless {
	kind: "rootless";
	id: string;
	chord: string;
	label: string;
	was: string;
	/** Set when the fingering is a typo as well; `barre` goes with it. */
	fingers?: string;
	barre?: number | null;
}

interface Delete {
	kind: "delete";
	id: string;
	chord: string;
	label: string;
	was: string;
	why: string;
}

type Action = Replace | Fingers | Rootless | Delete;

const HAND_WRITTEN_NOTE = "Hand-written for this library, not from a published chord table — trust your ear over the diagram.";
// Prose, not a chord name: it is rendered as plain text, so the accidental is a
// real glyph here (MusicalText would also turn the b of "bass" into a flat).
const rootlessNote = (root: string) =>
	`Rootless: no ${root.replace("b", "♭").replace("#", "♯")} sounds — a comping shape that leaves the root to the bass.`;

const replace = (
	chord: string,
	label: string,
	id: string,
	was: string,
	shape: readonly number[],
	fingers: string,
	barre: number | null,
	sounds: string,
	why: string,
): Replace => ({ kind: "replace", id, chord, label, was, shape, fingers, barre, sounds, why });

const fingers = (chord: string, label: string, id: string, was: string, fingers: string, barre: number | null): Fingers =>
	({ kind: "fingers", id, chord, label, was, fingers, barre });

const rootless = (chord: string, label: string, id: string, was: string, fingers?: string, barre?: number | null): Rootless =>
	({ kind: "rootless", id, chord, label, was, fingers, barre });

const del = (chord: string, label: string, id: string, was: string, why: string): Delete =>
	({ kind: "delete", id, chord, label, was, why });

const handWritten = (r: Replace): Replace => ({ ...r, note: HAND_WRITTEN_NOTE });

const ACTIONS: readonly Action[] = [
	// ── Standard rows: the chord page's first card and what a bare name plays ──
	replace("A m/G#", "Standard", "f48d8fde-deef-454a-93d5-3e320b06df65", "x-x-4-5-5-5",
		[4, -1, 2, 2, 1, 0], "402310", null, "G# E A C", "was F#m7b5; the open Am with the pinky on G#"),
	replace("C 9", "Standard", "77a348b0-41a9-4785-a51d-fdd250aba3e1", "x-3-2-0-3-0",
		[-1, 3, 2, 3, 3, 3], "021333", 3, "C E A# D G", "was Cadd9 (no b7); ChordPro's C9"),
	replace("C# 11", "Standard", "b96c7713-8137-4c6d-ad41-4b3d0cf901cc", "x-4-3-0-0-4",
		[-1, 4, 4, 4, 4, 4], "011111", 4, "C# F# B D# G#", "was C#7b5; the five-string 11 barre"),
	replace("C# aug", "Standard", "b55a19d0-2ab1-431a-8a65-9e011c1e5eb3", "x-4-4-4-2-2",
		[-1, 4, 3, 2, 2, -1], "043120", null, "C# F A", "was not an aug; the Caug shape up a fret"),
handWritten(	replace("C# m9/B", "Standard", "1f0067a7-57bc-487d-bac3-2958b7dd9a1d", "7-4-6-4-4-4",
		[7, 4, 6, 4, 4, 0], "413110", 4, "B C# G# D# E", "had no minor third; the open e supplies it")),
	fingers("C# maj13", "Standard", "7b4938f0-1853-467f-8270-753e75661294", "x-4-1-3-1-1", "041311", 1),

	// ── C 7sg (#63): handled by REPARENT below, plus this duplicate of C 7 Variation 2 ──
	del("C 7sg", "Variation 3", "a2302352-9f00-48aa-a4ba-d907562377ed", "3-3-5-3-5-3", "same shape as C 7 Variation 2"),

	// ── Variations: wrong chord, rewritten in place ──
handWritten(	replace("A dim", "Variation 2", "6e0f0835-9644-4c12-98b2-e4ebafa7b43d", "5-3-x-4-3-x",
		[5, 6, 7, 5, -1, -1], "123100", 5, "A D# C", "sounded B and D")),
	replace("B aug", "Variation 4", "a602cdff-cde1-4afd-9c22-939558189bed", "x-14-13-12-12-0",
		[-1, 14, 13, 12, 12, -1], "032110", 12, "B D# G", "open e (E) muted"),
	replace("Bb 6", "Variation 3", "096d7e0b-b90a-42a4-801d-a86ff12893e0", "6-8-x-7-8-6",
		[6, 8, -1, 7, 8, -1], "130240", null, "A# F D G", "no finger left for the high e; muted"),
	replace("Bb 6", "Variation 4", "c73de07c-27e5-4ee5-b134-c5635f592e70", "x-13-11-11-10-x",
		[-1, 13, 12, 12, 11, -1], "042310", null, "A# D G", "sounded C# F# A"),
	replace("C 9", "Variation 4", "a39248ab-e112-47b3-bddd-8a87064e1298", "8-10-8-7-8-10",
		[8, 10, 8, 9, 8, 10], "131214", 8, "C G A# E D", "had no third; the E-shape 9 barre"),
	replace("C# 11", "Variation 2", "bddc311c-033b-404e-863c-db46002dc4df", "x-4-5-4-6-4",
		[-1, 4, 6, 4, 7, 4], "013141", 4, "C# G# B F#", "was a copy of C# 9#11; the A-shape 11"),
	replace("C# 11", "Variation 3", "8d2521c8-6cf5-4391-aa70-6708ea2ff4fc", "9-8-9-8-8-9",
		[9, 9, 9, 10, 9, 9], "111211", 9, "C# F# B F G#", "was a copy of C# 9#11; the E-shape 11"),
handWritten(	replace("C# 11", "Variation 4", "144b7e4d-58e0-4a87-a9e0-9c3cf59023ba", "9-10-9-10-9-9",
		[-1, -1, 11, 11, 12, 11], "001121", 11, "C# F# B D#", "was a copy of C# 9#11; a four-string 11")),
	replace("C# 7b5", "Variation 4", "5e429454-2876-4d23-84b6-8af7f444a64d", "x-x-12-13-13-14",
		[-1, -1, 11, 12, 12, 13], "001234", null, "C# G B F", "the same shape one fret too high"),
handWritten(	replace("C# 9#11", "Variation 2", "ac3d1fb0-c3d7-4269-be73-94f13dde3796", "x-3-2-0-0-3",
		[-1, 4, 3, 4, 4, 3], "041231", 3, "C# F B D# G", "was a C chord")),
	replace("C# aug", "Variation 2", "cbfce7a9-97b0-4f02-bf7d-82b12cce11e7", "4-4-6-4-7-4",
		[-1, -1, 7, 6, 6, 5], "004231", null, "A C# F", "was C#7sus4/G#"),
handWritten(	replace("C# sus2", "Variation 2", "4c013964-2f59-47a9-88ac-a5a103320cc1", "9-6-6-8-9-x",
		[-1, -1, 6, 8, 9, 9], "001234", null, "G# D# C#", "the root sat on an unreachable low E")),
	replace("D maj9", "Variation 2", "f0d4b7d1-5b27-4814-b5cf-b9255cdabbf0", "x-5-4-6-4-x",
		[-1, 5, 4, 6, 5, -1], "021430", null, "D F# C# E", "D# for E on the B string"),
handWritten(	replace("D mmaj11", "Variation 3", "02cda36f-de8b-4cf5-81b1-25a664291a3b", "5-5-5-7-7-5",
		[-1, 5, 5, 6, 6, -1], "011230", 5, "D G C# F", "was a D/A sus shape")),
	replace("D mmaj7", "Variation 2", "53f870ea-fa3e-49b3-9ad5-3d8927b158cf", "x-5-3-2-2-0",
		[-1, 5, 3, 2, 2, -1], "042110", 2, "D F A C#", "open e (a 9th) muted"),
	replace("E madd9", "Variation 2", "81c4d3d5-4009-495f-b51f-b47d96b615b4", "x-8-6-5-8-x",
		[-1, 7, 5, 4, 7, -1], "032140", null, "E G B F#", "an Fm(add9) shape; down a fret"),
handWritten(	replace("E madd9", "Variation 3", "548b4d4e-301d-474d-815b-6b33bd76b55a", "x-8-6-0-6-8",
		[-1, 7, 5, 0, 7, 7], "021034", null, "E G F# B", "an Fm shape")),
	replace("E madd9", "Variation 4", "2976d8d7-a580-4c47-8dbe-ea689bf72e3f", "x-8-10-0-9-8",
		[0, 2, 2, 0, 0, 2], "023004", null, "E B G F#", "an Fm shape; the open Em with F# on top"),
	replace("E madd9", "Variation 5", "6858cd90-c884-4435-8b28-87ccab30342f", "x-x-3-1-1-3",
		[-1, -1, 2, 0, 0, 2], "001002", null, "E G B F#", "an Fm(add9) shape; down a fret"),
	replace("Eb 11", "Variation 3", "f98351b2-e941-4196-8bc2-6b5bd5cb2782", "0-6-6-6-8-6",
		[-1, 6, 6, 6, 8, 6], "011131", 6, "D# G# C# G A#", "open low E muted"),
	replace("Eb 7b5", "Variation 3", "cc35ac08-7b2f-4880-9267-5686f8e3b9e4", "x-6-7-6-8-6",
		[-1, 6, 7, 6, 8, -1], "012130", 6, "D# A C# G", "high e (a natural 5th) muted"),
	replace("Eb maj7b5", "Variation 2", "67b7548f-1e7e-4668-9827-636672dd180d", "x-6-7-7-8-6",
		[-1, 6, 7, 7, 8, -1], "012340", null, "D# A D G", "high e (a natural 5th) muted"),
	replace("F /A", "Variation 3", "c1258b86-9b63-4ee4-b749-a3a2e0f816a2", "5-3-3-5-6-0",
		[5, 3, 3, 5, 6, -1], "211340", 3, "A C F", "open e (E) muted"),
	replace("F# alt", "Variation 4", "b365029c-62d6-4f8a-8cc1-948ad122cd28", "x-9-10-11-11-9",
		[-1, 9, 10, 11, 11, -1], "012340", null, "F# C A#", "high e (a natural 5th) muted"),
handWritten(	replace("G add9", "Variation 2", "4f59143e-963e-410c-8f1d-07a80101b7f6", "x-x-3-2-1-4",
		[-1, -1, 5, 4, 3, 5], "003214", null, "G B D A", "sounded F A C G#")),
handWritten(	replace("G m11", "Variation 3", "9949fb95-5d8e-46c2-a009-4402ed4d10d1", "x-x-5-5-7-7",
		[-1, 10, 8, 10, 11, 8], "021341", 8, "G A# F C", "sounded F# and B")),

	// ── Variations: shape fine, fingering a typo ──
	fingers("A maj7#5", "Variation 4", "2f736ff5-2aa5-4f8b-a006-0496bdee5528", "9-12-11-10-9-9", "143211", 9),
	fingers("B aug7", "Variation 2", "855fe4cc-2b94-4d55-8edb-063a5447a29a", "x-2-5-2-4-3", "014132", 2),
	fingers("C# /F", "Variation 2", "f1cb7179-5f65-4264-9f05-823e269aa473", "1-x-x-1-2-1", "100121", 1),
	fingers("F# /Bb", "Variation 2", "a4dfb54f-f3ad-48e2-a2e7-cf1338593cbe", "6-x-x-6-7-6", "100121", 6),
	fingers("C# sus4", "Variation 3", "f3842e80-4415-4af3-a924-d4e986fe59db", "9-x-6-6-7-9", "301124", 6),
	fingers("D 11", "Variation 4", "35c393a5-2eba-4b4e-889d-4eede0b9d080", "x-9-7-7-8-8", "041123", 7),
	fingers("E aug", "Variation 3", "f639d78e-c276-4446-9f17-e2aae98c3dbd", "x-7-10-9-9-x", "014230", null),
	fingers("Eb 9b5", "Variation 3", "f494d71a-8179-4f70-a9ea-6ac418055974", "11-10-11-10-10-11", "213114", 10),
	fingers("G dim", "Variation 3", "274e362c-254a-438a-895d-6f6ca96f875b", "x-10-8-x-8-9", "041023", null),

	// ── Variations: rootless comping shapes — kept, and said so ──
	rootless("Ab 7b9", "Variation 2", "fb45fb41-c188-4f73-bbfe-348a9ab9ecc4", "x-x-4-5-4-5", "001324", null),
	rootless("Ab aug9", "Variation 3", "227397a3-dfb0-444b-a901-583fd7731256", "x-x-4-5-5-6"),
	rootless("B maj9", "Variation 2", "32abfc1c-cbaa-4471-9264-056d9320572a", "x-x-4-6-4-6"),
	rootless("Bb m9", "Variation 2", "1be7c565-ba7d-4eb7-b83f-e6b19d5d93ac", "x-x-3-5-2-4"),
	rootless("C# 7b9", "Variation 4", "65a782cb-42ae-4742-8ad8-a1ab0b3a74c9", "x-x-9-10-9-10"),
	rootless("E maj9", "Variation 4", "8d6c50f1-2012-4987-9005-2c308f511091", "x-x-9-11-9-11"),
	rootless("Eb m9", "Variation 2", "a8b5b5d1-ac08-44cd-8d98-71ec6a4afc8e", "x-x-8-10-7-9"),
	rootless("Eb maj9", "Variation 4", "4ea47bda-a5fc-420b-83dc-10f15abf13ec", "x-x-12-12-11-13"),
	rootless("Eb mmaj9", "Variation 2", "e777a291-74ab-43a4-b95c-a218f478dc40", "6-9-8-7-6-6"),
	rootless("F maj9", "Variation 2", "25ec7425-6cdf-4949-a173-758c6a5079e5", "x-x-2-2-1-3"),
	rootless("F maj9", "Variation 4", "abe106b4-8aab-4c4c-8c2e-26dff9a11cef", "x-x-10-12-10-12"),
	rootless("F# m9", "Variation 4", "a4ff9351-2668-4e01-a36a-7739c419be7a", "x-x-11-13-10-12"),
	rootless("G maj9", "Variation 3", "1bb6a4d3-c052-49ac-9255-25144fe77102", "x-x-4-4-3-5"),

	// ── Variations: a different chord, with no one-note fix ──
	del("Ab maj7b5", "Variation 3", "4d10d544-6409-4801-98ee-a698dfca22c7", "0-0-6-7-8-8", "sounds E A G# D G C"),
	del("C# m9/B", "Variation 2", "1a7e5b52-8d10-4904-bfda-0df3bc8c08b4", "7-4-6-6-4-4", "no minor third; a B6/9 shape"),
	del("C# m9/B", "Variation 3", "a6973eab-4286-46dc-aaad-79a968df15f4", "x-14-11-13-12-11", "no minor third; a B6/9 shape"),
	del("C# m9/B", "Variation 4", "3cfe7627-dd53-4802-8c41-d98b53a66b08", "7-4-6-4-4-x", "no minor third; a B6/9 shape"),
	del("D 7#9", "Variation 2", "a413aa4e-34b3-4339-9bb8-505c8c9b58fe", "0-0-0-10-7-8", "open strings under a 10th-fret shape"),
	del("Eb m69", "Variation 3", "56141db5-739c-4814-8ea6-3379b2d2e5f7", "11-9-10-10-9-9", "sounds G# and C#"),
	del("F# m9/E", "Variation 3", "54c067ee-2d5c-4c56-aa94-4007cf2b6cf0", "x-7-4-6-5-4", "no minor third"),
	del("F# m9/E", "Variation 4", "41c3b069-3345-432a-9bb1-54ff850d1a05", "12-9-11-9-9-9", "no minor third"),
];

// #63: the two "C 7sg" shapes that are not already under C 7 move there. C 7
// has Standard + Variations 2–4, so they become 5 and 6.
const REPARENT = [
	{ id: "a1a535c3-f48d-4ce5-91ef-76115cf72b18", chord: "C 7sg", label: "Standard", was: "3-3-2-3-x-x", toLabel: "Variation 5" },
	{ id: "173ebae4-aa7c-44af-9f04-082fe9022687", chord: "C 7sg", label: "Variation 2", was: "3-1-2-0-1-0", toLabel: "Variation 6" },
] as const;
const REPARENT_FROM = { root: "C", suffix: "7sg" } as const;
const REPARENT_TO = { root: "C", suffix: "7" } as const;

// ── Row encoding ─────────────────────────────────────────────────────────────
// The table's convention: start_fret is 1 while the shape fits under the fifth
// fret, else the lowest fretted fret; frets are relative to it, 0 stays open.

interface Encoded {
	start_fret: number;
	frets: string;
	fingers: string;
	barre_fret: number | null;
	capo: boolean;
	note: string | null;
}

function encode(shape: readonly number[], fingerStr: string, barre: number | null, note: string | null): Encoded {
	const fretted = shape.filter((f) => f > 0);
	const start_fret = Math.max(...fretted) <= 4 ? 1 : Math.min(...fretted);
	const rel = (f: number) => f - start_fret + 1;
	if (fretted.some((f) => rel(f) > 5)) throw new Error(`shape ${dashed(shape)} does not fit a five-fret window`);
	const frets = shape.map((f) => (f < 0 ? "x" : f === 0 ? "0" : String(rel(f)))).join("");
	// `capo` is not read by anything; mirror the imported rows, which set it when a
	// first-finger barre reaches the high e.
	const capo = barre !== null && fingerStr[5] === "1" && shape[5] === barre;
	return { start_fret, frets, fingers: fingerStr, barre_fret: barre === null ? null : rel(barre), capo, note };
}

/** A shape as the tables above write it: absolute frets joined by dashes. */
const dashed = (abs: readonly number[]) => abs.map((f) => (f < 0 ? "x" : String(f))).join("-");

const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const OPEN_MIDI = [40, 45, 50, 55, 59, 64] as const;

function noteSet(shape: readonly number[]): string {
	const pcs = new Set(shape.flatMap((f, i) => (f < 0 ? [] : [(OPEN_MIDI[i] + f) % 12])));
	return [...pcs].sort((a, b) => a - b).map((pc) => NOTE[pc]).join(" ");
}

function sortedNotes(spelled: string): string {
	return spelled.split(" ").map((n) => NOTE.indexOf(n)).sort((a, b) => a - b).map((pc) => NOTE[pc]).join(" ");
}

// ── Data access ──────────────────────────────────────────────────────────────

interface Row extends VoicingRow {
	chord_id: string;
	capo: boolean;
}

const ROOT_PC: Record<string, number> = {
	C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
	G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

function soundsRoot(row: Row): boolean {
	const pcs = new Set(absoluteFrets(row).flatMap((f, i) => (f < 0 ? [] : [(OPEN_MIDI[i] + f) % 12])));
	return pcs.has(ROOT_PC[row.chords.root]);
}

async function fetchVoicings(supabase: SupabaseClient): Promise<Map<string, Row>> {
	const rows: Row[] = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await supabase
			.from("chord_voicings")
			.select("id, chord_id, label, start_fret, barre_fret, capo, frets, fingers, note, chords(root, suffix)")
			.order("id")
			.range(from, from + 999);
		if (error) {
			if (error.message.includes("note")) {
				throw new Error("chord_voicings has no `note` column yet — run scripts/add-chord-voicing-note.sql first.");
			}
			throw new Error(`Fetching voicings: ${error.message}`);
		}
		const page = data as unknown as Row[];
		rows.push(...page);
		if (page.length < 1000) break;
	}
	if (rows.length < 2000) throw new Error(`Only ${rows.length} voicings came back — expected the whole table.`);
	return new Map(rows.map((r) => [r.id, r]));
}

async function fetchChordId(supabase: SupabaseClient, root: string, suffix: string): Promise<string | null> {
	const { data, error } = await supabase.from("chords").select("id").eq("root", root).eq("suffix", suffix).maybeSingle();
	if (error) throw new Error(`Fetching chord ${root} ${suffix}: ${error.message}`);
	return data ? (data as { id: string }).id : null;
}

/** Every place user data can hold a voicing id or a chord suffix, as text. */
async function fetchUserData(supabase: SupabaseClient): Promise<{ table: string; id: string; text: string }[]> {
	const sources = [
		{ table: "user_pattern_progressions", key: "id", column: "bars" },
		{ table: "user_fingerpick_patterns", key: "pattern_id", column: "measures" },
		{ table: "shared_items", key: "id", column: "payload" },
		{ table: "user_chord_voicings", key: "id", column: "suffix" },
	];
	const out: { table: string; id: string; text: string }[] = [];
	for (const { table, key, column } of sources) {
		const { data, error } = await supabase.from(table).select(`${key}, ${column}`);
		if (error) throw new Error(`Fetching ${table}: ${error.message}`);
		for (const row of data as Record<string, unknown>[]) {
			out.push({ table, id: String(row[key]), text: JSON.stringify(row[column]) });
		}
	}
	return out;
}

const chordOf = (r: VoicingRow) => `${r.chords.root} ${r.chords.suffix}`;

// ── Calibration ──────────────────────────────────────────────────────────────

function calibrate(rows: Map<string, Row>, userData: { table: string; id: string; text: string }[]): string[] {
	const problems: string[] = [];
	const targets: { id: string; chord: string; label: string; was: string }[] = [...ACTIONS, ...REPARENT];

	// Each target is still what the table says it is.
	for (const t of targets) {
		const row = rows.get(t.id);
		if (!row) {
			problems.push(`${t.chord} ${t.label}: row ${t.id} not found`);
			continue;
		}
		const actual = `${chordOf(row)} ${row.label} ${dashed(absoluteFrets(row))}`;
		const expected = `${t.chord} ${t.label} ${t.was}`;
		if (actual !== expected) problems.push(`${expected}: live row is ${actual}`);
	}

	// Each written row sounds what it claims and passes the audit.
	for (const a of ACTIONS) {
		if (a.kind === "delete" || a.kind === "rootless") continue;
		const row = rows.get(a.id);
		if (!row) continue;
		const shape = a.kind === "replace" ? a.shape : absoluteFrets(row);
		if (a.kind === "replace" && noteSet(shape) !== sortedNotes(a.sounds)) {
			problems.push(`${a.chord} ${a.label}: ${dashed(shape)} sounds ${noteSet(shape)}, table says ${sortedNotes(a.sounds)}`);
		}
		let encoded: Encoded;
		try {
			encoded = encode(shape, a.fingers, a.barre, a.kind === "replace" ? (a.note ?? null) : row.note);
		} catch (err) {
			problems.push(`${a.chord} ${a.label}: ${(err as Error).message}`);
			continue;
		}
		const findings = checkVoicing({ ...row, ...encoded });
		for (const f of findings) problems.push(`${a.chord} ${a.label}: ${dashed(shape)} — ${f.section}: ${f.problem}`);
	}

	// A row kept as rootless really is: the audit will hold it to its note.
	for (const a of ACTIONS) {
		if (a.kind !== "rootless") continue;
		const row = rows.get(a.id);
		if (!row) continue;
		if (soundsRoot(row)) problems.push(`${a.chord} ${a.label}: marked rootless but sounds ${row.chords.root}`);
		const findings = checkVoicing({ ...row, ...rootlessPatch(a, row) });
		for (const f of findings) problems.push(`${a.chord} ${a.label}: ${a.was} — ${f.section}: ${f.problem}`);
	}

	// Nothing a user saved points at a row that goes away.
	const doomed = ACTIONS.filter((a): a is Delete => a.kind === "delete");
	for (const d of doomed) {
		for (const u of userData) {
			if (u.text.includes(d.id)) problems.push(`${d.chord} ${d.label}: pinned by ${u.table} ${u.id} — cannot delete`);
		}
	}
	for (const u of userData) {
		if (u.text.includes('"7sg"')) problems.push(`${u.table} ${u.id} refers to suffix 7sg — cannot drop the chord`);
	}

	// The reparent target holds exactly Standard + Variations 2–4.
	return problems;
}

function rootlessPatch(a: Rootless, row: Row): Partial<Encoded> {
	const patch: Partial<Encoded> = { note: rootlessNote(row.chords.root) };
	if (a.fingers !== undefined) {
		const { fingers, barre_fret } = encode(absoluteFrets(row), a.fingers, a.barre ?? null, null);
		patch.fingers = fingers;
		patch.barre_fret = barre_fret;
	}
	return patch;
}

// ── Apply ────────────────────────────────────────────────────────────────────

function renumberPlan(rows: Map<string, Row>): { id: string; from: string; to: string }[] {
	const deleted = new Set(ACTIONS.filter((a) => a.kind === "delete").map((a) => a.id));
	const touched = new Set(ACTIONS.filter((a) => a.kind === "delete").map((a) => rows.get(a.id)?.chord_id));
	const plan: { id: string; from: string; to: string }[] = [];
	for (const chordId of touched) {
		const survivors = [...rows.values()]
			.filter((r) => r.chord_id === chordId && !deleted.has(r.id) && /^Variation \d+$/.test(r.label ?? ""))
			.sort((a, b) => parseInt(a.label!.slice(10), 10) - parseInt(b.label!.slice(10), 10));
		survivors.forEach((r, i) => {
			const to = `Variation ${i + 2}`;
			if (r.label !== to) plan.push({ id: r.id, from: r.label!, to });
		});
	}
	return plan;
}

async function apply(
	supabase: SupabaseClient,
	rows: Map<string, Row>,
	fromChordId: string,
	toChordId: string,
): Promise<void> {
	const fail = (what: string, message: string) => new Error(`${what}: ${message}`);

	for (const a of ACTIONS) {
		if (a.kind === "delete") continue;
		const row = rows.get(a.id)!;
		const patch =
			a.kind === "rootless"
				? rootlessPatch(a, row)
				: encode(a.kind === "replace" ? a.shape : absoluteFrets(row), a.fingers, a.barre, a.kind === "replace" ? (a.note ?? null) : row.note);
		const { error } = await supabase.from("chord_voicings").update(patch).eq("id", a.id);
		if (error) throw fail(`Updating ${a.chord} ${a.label}`, error.message);
	}
	for (const r of REPARENT) {
		const { error } = await supabase.from("chord_voicings").update({ chord_id: toChordId, label: r.toLabel }).eq("id", r.id);
		if (error) throw fail(`Reparenting ${r.chord} ${r.label}`, error.message);
	}
	for (const a of ACTIONS) {
		if (a.kind !== "delete") continue;
		const { error } = await supabase.from("chord_voicings").delete().eq("id", a.id);
		if (error) throw fail(`Deleting ${a.chord} ${a.label}`, error.message);
	}
	for (const r of renumberPlan(rows)) {
		const { error } = await supabase.from("chord_voicings").update({ label: r.to }).eq("id", r.id);
		if (error) throw fail(`Renumbering ${r.id}`, error.message);
	}
	const { error } = await supabase.from("chords").delete().eq("id", fromChordId);
	if (error) throw fail("Deleting the C 7sg chord", error.message);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);

	console.log("Fetching voicings, chords and user data …");
	const rows = await fetchVoicings(supabase);
	const fromChordId = await fetchChordId(supabase, REPARENT_FROM.root, REPARENT_FROM.suffix);
	const toChordId = await fetchChordId(supabase, REPARENT_TO.root, REPARENT_TO.suffix);
	const userData = await fetchUserData(supabase);
	console.log(`  ${rows.size} voicings, ${userData.length} user rows that could pin one.\n`);

	const counts = { replace: 0, fingers: 0, rootless: 0, delete: 0 };
	for (const a of ACTIONS) counts[a.kind] += 1;
	const handWrittenCount = ACTIONS.filter((a) => a.kind === "replace" && a.note).length;
	console.log(
		`Plan: ${counts.replace} shapes rewritten (${handWrittenCount} noted as hand-written), ${counts.fingers} fingerings fixed, ` +
			`${counts.rootless} rootless rows noted, ${counts.delete} rows deleted, ${REPARENT.length} rows moved to C 7, 1 chord row dropped.\n`,
	);
	for (const a of ACTIONS) {
		const row = rows.get(a.id);
		const label = `${a.chord.padEnd(10)} ${a.label.padEnd(12)}`;
		if (a.kind === "replace") console.log(`  replace  ${label} ${a.was.padEnd(18)} → ${dashed(a.shape).padEnd(18)} ${a.why}${a.note ? "  [hand-written]" : ""}`);
		else if (a.kind === "fingers") console.log(`  fingers  ${label} ${a.was.padEnd(18)}   ${(row?.fingers ?? "?")} → ${a.fingers}`);
		else if (a.kind === "rootless") console.log(`  rootless ${label} ${a.was.padEnd(18)}   kept; note added${a.fingers ? `; fingers ${row?.fingers} → ${a.fingers}` : ""}`);
		else console.log(`  delete   ${label} ${a.was.padEnd(18)}   ${a.why}`);
	}
	for (const r of REPARENT) console.log(`  reparent ${r.chord.padEnd(10)} ${r.label.padEnd(12)} ${r.was.padEnd(18)} → C 7 ${r.toLabel}`);
	for (const r of renumberPlan(rows)) console.log(`  relabel  ${chordOf(rows.get(r.id)!).padEnd(10)} ${r.from} → ${r.to}`);

	console.log("\nCalibrating …");
	const problems = calibrate(rows, userData);
	if (!fromChordId) problems.push("chord C 7sg not found");
	if (!toChordId) problems.push("chord C 7 not found");
	const c7Labels = [...rows.values()].filter((r) => r.chord_id === toChordId).map((r) => r.label).sort();
	if (c7Labels.join(",") !== "Standard,Variation 2,Variation 3,Variation 4") {
		problems.push(`C 7 holds ${c7Labels.join(", ")} — the reparent labels assume Standard + Variations 2–4`);
	}
	if (problems.length > 0) {
		for (const p of problems) console.error(`  [FAIL] ${p}`);
		console.error("Calibration FAILED — nothing written.");
		process.exit(1);
	}
	console.log("  OK.");

	if (!APPLY) {
		console.log("\nDry run. Re-run with --apply to write.");
		return;
	}

	console.log("\nApplying …");
	await apply(supabase, rows, fromChordId!, toChordId!);

	console.log("Re-verifying …");
	const after = await fetchVoicings(supabase);
	const touchedChords = new Set([...ACTIONS, ...REPARENT].map((a) => rows.get(a.id)!.chord_id).concat(toChordId!));
	const findings = [...after.values()].filter((r) => touchedChords.has(r.chord_id)).flatMap(checkVoicing);
	const gone = ACTIONS.filter((a) => a.kind === "delete").every((a) => !after.has(a.id));
	const dropped = (await fetchChordId(supabase, REPARENT_FROM.root, REPARENT_FROM.suffix)) === null;
	for (const f of findings) console.error(`  [FAIL] ${f.chord} ${f.label} ${f.shape}: ${f.problem}`);
	if (!gone) console.error("  [FAIL] a deleted row is still there");
	if (!dropped) console.error("  [FAIL] the C 7sg chord is still there");
	if (findings.length > 0 || !gone || !dropped) process.exit(1);
	console.log(`  Done. ${after.size} voicings remain; every touched chord passes the audit.`);
	console.log("  Now run: npx tsx scripts/audit-chord-voicings.ts --standard");
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
