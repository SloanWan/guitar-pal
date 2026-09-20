// One-off: the author's custom shapes pinned by the shipped 斑马斑马 and
// Birds of a feather arrangements become library voicings, so every player
// sees the arrangement with the shapes it was written on.
//
//   npx tsx scripts/ship-author-voicings.ts           # dry run
//   npx tsx scripts/ship-author-voicings.ts --apply
//
// Calibration: two of the five pinned shapes must already be in the library
// as the chord's Standard voicing (C maj7 x32000, B minor x24432); the script
// refuses to run if they are not found, since that would mean the library it
// is looking at is not the one the arrangements were written against.
// Safe to delete after a successful run.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");
const NOTE = "The author's own shape, from the shipped 斑马斑马 / Birds of a feather arrangements.";

interface Shape { root: string; suffix: string; start_fret: number; barre_fret: number | null; frets: string; fingers: string; label: string }
const NEW: Shape[] = [
	{ root: "G", suffix: "add11", start_fret: 1, barre_fret: null, frets: "320013", fingers: "320014", label: "Standard" },
	{ root: "D", suffix: "69", start_fret: 2, barre_fret: null, frets: "x43000", fingers: "021000", label: "Variation 5" },
	{ root: "B", suffix: "m7", start_fret: 1, barre_fret: null, frets: "x20202", fingers: "010203", label: "Variation 5" },
];
const EXPECT_EXISTING = [
	{ root: "C", suffix: "maj7", frets: "x32000", id: "880eea05-0e36-4d9e-9f2f-d7cfede73643" },
	{ root: "B", suffix: "minor", frets: "x24432", id: "b2609c3c-e0db-4282-b697-7f251ce07e6b" },
];

async function chordId(root: string, suffix: string): Promise<string | null> {
	const { data, error } = await db.from("chords").select("id").eq("root", root).eq("suffix", suffix).maybeSingle();
	if (error) throw error;
	return data?.id ?? null;
}

async function main() {
	// Calibration.
	for (const e of EXPECT_EXISTING) {
		const id = await chordId(e.root, e.suffix);
		const { data } = await db.from("chord_voicings").select("id, frets, start_fret").eq("chord_id", id!).eq("frets", e.frets);
		if (!data?.some((v) => v.id === e.id && v.start_fret === 1)) throw new Error(`calibration failed: ${e.root} ${e.suffix} ${e.frets} not found as ${e.id}`);
		console.log(`ok  ${e.root} ${e.suffix} ${e.frets} already in the library as ${e.id}`);
	}

	for (const s of NEW) {
		let cid = await chordId(s.root, s.suffix);
		const { data: dupes } = cid ? await db.from("chord_voicings").select("id").eq("chord_id", cid).eq("frets", s.frets).eq("start_fret", s.start_fret) : { data: [] };
		if (dupes && dupes.length > 0) {
			console.log(`skip ${s.root} ${s.suffix} ${s.frets}: already ${dupes[0].id}`);
			continue;
		}
		console.log(`${APPLY ? "add " : "plan"} ${s.root} ${s.suffix} ${s.frets} start ${s.start_fret} "${s.label}"${cid ? "" : " (+ chord row)"}`);
		if (!APPLY) continue;
		if (!cid) {
			const { data, error } = await db.from("chords").insert({ root: s.root, suffix: s.suffix }).select("id").single();
			if (error) throw error;
			cid = data.id;
		}
		const { data, error } = await db
			.from("chord_voicings")
			.insert({ chord_id: cid, label: s.label, start_fret: s.start_fret, barre_fret: s.barre_fret, capo: false, frets: s.frets, fingers: s.fingers, note: NOTE })
			.select("id")
			.single();
		if (error) throw error;
		console.log(`     → ${data.id}`);
	}
}
main().catch((e) => { console.error(e); process.exit(1); });
