// One-time migration: imports C# and F# chord data from tombatossals/chords-db.
//
// Run with:
//   npx tsx scripts/import-missing-roots.ts
//
// Prerequisites:
//   - NEXT_PUBLIC_SUPABASE_URL in .env.local
//   - SUPABASE_SERVICE_ROLE_KEY in .env.local  (Dashboard → Settings → API → service_role)
//
// Safe to delete after a successful run.

import { createClient } from "@supabase/supabase-js";
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

// ── Source ───────────────────────────────────────────────────────────────────

const GUITAR_JSON_URL =
	"https://raw.githubusercontent.com/tombatossals/chords-db/master/lib/guitar.json";

// tombatossals key name → project root spelling
const IMPORT_ROOTS: Record<string, string> = {
	Csharp: "C#",
	Fsharp: "F#",
};

// ── Tombatossals types ───────────────────────────────────────────────────────

interface TombPosition {
	frets: number[];    // -1 = muted; low-E → high-e order (matches project schema directly)
	fingers: number[];  // same order; 0 = no finger
	baseFret: number;
	barres: number[];   // barre fret value(s); plain number[], not objects
	capo?: boolean;
	midi?: number[];    // unused
}

interface TombChord {
	key: string;
	suffix: string;
	positions: TombPosition[];
}

interface GuitarJson {
	chords: Record<string, TombChord[]>;
}

// ── Transform ────────────────────────────────────────────────────────────────

// frets/fingers arrays are already in low-E→high-e order — no reversal needed.
function encodeStringArray(arr: number[]): string {
	return arr.map((v) => (v === -1 ? "x" : String(v))).join("");
}

interface ProjectVoicing {
	start_fret: number;
	frets: string;
	fingers: string;
	barre_fret: number | null;
	capo: boolean;
	label: string;
}

function transformPosition(pos: TombPosition, idx: number): ProjectVoicing {
	return {
		start_fret: pos.baseFret,
		frets: encodeStringArray(pos.frets),
		fingers: encodeStringArray(pos.fingers),
		barre_fret: pos.barres.length > 0 ? (pos.barres[0] ?? null) : null,
		capo: pos.capo ?? false,
		label: idx === 0 ? "Standard" : `Variation ${idx + 1}`,
	};
}

// ── Ground truth for calibration ─────────────────────────────────────────────
// Four C major voicings already in Supabase — verified by inspection.

type TruthRow = Omit<ProjectVoicing, "label">;

const C_MAJOR_GROUND_TRUTH: TruthRow[] = [
	{ start_fret: 1, frets: "x32010", fingers: "032010", barre_fret: null, capo: false },
	{ start_fret: 3, frets: "x13331", fingers: "012341", barre_fret: 1, capo: true },
	{ start_fret: 5, frets: "xx1114", fingers: "001114", barre_fret: 1, capo: false },
	{ start_fret: 8, frets: "133211", fingers: "134211", barre_fret: 1, capo: true },
];

function calibrate(data: GuitarJson): boolean {
	const cMajor = data.chords["C"]?.find((c) => c.suffix === "major");
	if (!cMajor) {
		console.error("  Calibration FAILED: C major not found in source.");
		return false;
	}

	let ok = true;
	for (let i = 0; i < C_MAJOR_GROUND_TRUTH.length; i++) {
		const truth = C_MAJOR_GROUND_TRUTH[i];
		const got = transformPosition(cMajor.positions[i], i);
		if (!got) {
			console.error(`  [FAIL] Voicing ${i}: not present in transform output.`);
			ok = false;
			continue;
		}
		let positionFailed = false;
		for (const field of ["start_fret", "frets", "fingers", "barre_fret", "capo"] as const) {
			if (got[field] !== truth[field]) {
				console.error(
					`  [FAIL] Voicing ${i} "${field}": expected ${JSON.stringify(truth[field])}, got ${JSON.stringify(got[field])}`,
				);
				ok = false;
				positionFailed = true;
			}
		}
		if (positionFailed) {
			console.error(`  Raw position ${i} from source for debugging:`);
			console.error(JSON.stringify(cMajor.positions[i], null, 2));
		}
	}

	return ok;
}

// ── Import ───────────────────────────────────────────────────────────────────

async function importRoot(
	supabase: ReturnType<typeof createClient>,
	data: GuitarJson,
	tombKey: string,
	projectRoot: string,
): Promise<void> {
	const chords = data.chords[tombKey];
	if (!chords || chords.length === 0) {
		console.error(`  [ERROR] No chords found for source key "${tombKey}" (${projectRoot}). Key mismatch or empty data — aborting.`);
		process.exit(1);
	}

	let chordCount = 0;
	let voicingCount = 0;

	for (const chord of chords) {
		const { data: inserted, error: chordErr } = await supabase
			.from("chords")
			.insert({ root: projectRoot, suffix: chord.suffix })
			.select("id")
			.single();

		if (chordErr) {
			console.error(
				`  [ERROR] Inserting chord ${projectRoot} ${chord.suffix}: ${chordErr.message}`,
			);
			continue;
		}

		chordCount++;
		const chordId = (inserted as { id: string }).id;

		const voicings = chord.positions.map((pos, i) => ({
			chord_id: chordId,
			...transformPosition(pos, i),
		}));

		const { error: voicingErr } = await supabase.from("chord_voicings").insert(voicings);

		if (voicingErr) {
			console.error(
				`  [ERROR] Inserting voicings for ${projectRoot} ${chord.suffix}: ${voicingErr.message}`,
			);
			continue;
		}

		voicingCount += voicings.length;
	}

	console.log(`  ${projectRoot}: ${chordCount} chords, ${voicingCount} voicings inserted.`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);

	console.log("Fetching tombatossals/chords-db guitar.json …");
	const res = await fetch(GUITAR_JSON_URL);
	if (!res.ok) throw new Error(`Failed to fetch guitar.json: HTTP ${res.status}`);
	const data = (await res.json()) as GuitarJson;
	console.log("Fetched successfully.");

	// Step 1 — calibrate transform against known C major voicings
	console.log("\n── Step 1: Calibration ──────────────────────────────────────");
	const passed = calibrate(data);
	if (!passed) {
		console.error(
			"\nAborting — fix the transform to match the ground-truth rows before importing.",
		);
		process.exit(1);
	}
	console.log("  Calibration passed.");

	// Step 2 — import C# and F#
	console.log("\n── Step 2: Importing missing roots ──────────────────────────");
	for (const [tombKey, projectRoot] of Object.entries(IMPORT_ROOTS)) {
		console.log(`\n  ${projectRoot} (source key: ${tombKey})`);
		await importRoot(supabase, data, tombKey, projectRoot);
	}

	console.log("\nDone.");
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
