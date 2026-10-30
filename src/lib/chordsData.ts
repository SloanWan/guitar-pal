// Cached, cookie-free reads of the public chord reference tables.
//
// Chord data is shared read-only reference data that never changes at runtime,
// so it is wrapped in `unstable_cache` to serve from Next.js' data cache instead
// of hitting Supabase on every request. The client here is deliberately built
// from `@supabase/supabase-js` (not `createSupabaseServer`) so it reads NO
// cookies — `unstable_cache` forbids `cookies()`/`headers()` inside its scope,
// and these reads carry no per-user state anyway (anon role, public rows).
//
// Server Components import these directly. The Server Action wrappers in
// `chords.ts` (which client components call over the wire) delegate here, so
// both paths share one cache entry.

import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { isBrowsableSuffix } from "@/lib/chordSuffixes";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import type { ChordVoicing } from "@/lib/chordVoicing";

export interface ChordWithVoicings {
	id: string;
	root: string;
	suffix: string;
	chord_voicings: ChordVoicing[];
}

const VOICING_FIELDS = `
  id, root, suffix,
  chord_voicings ( id, label, start_fret, barre_fret, capo, frets, fingers, note )
` as const;

// Without an ORDER BY an embedded array comes back in physical order, and an
// UPDATE rewrites a row at the end of the heap — so a Standard the migration
// touched (#226, the default-voicing bass fix) would land last. "Standard"
// sorts before "Variation n", which keeps the default shape the first card.
const VOICING_ORDER = { referencedTable: "chord_voicings" } as const;

// Reference data changes only via a migration + redeploy, so a generous
// revalidate window is safe; the "chords" tag allows on-demand invalidation.
const CACHE_OPTS = { tags: ["chords"], revalidate: 3600 };

function publicClient() {
	return createClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{ auth: { persistSession: false } },
	);
}

// Each read throws on a Supabase error rather than returning an empty answer:
// `unstable_cache` keeps whatever comes back, so an outage returned as `null`
// or `[]` would be served as "no such chord" for the whole revalidate window.
function rows<T>({ data, error }: { data: unknown; error: { message: string } | null }): T {
	if (error) throw new Error(error.message);
	return data as T;
}

export const getChord = unstable_cache(
	async (root: string, suffix: string): Promise<ChordWithVoicings | null> =>
		rows<ChordWithVoicings | null>(
			await publicClient()
				.from("chords")
				.select(VOICING_FIELDS)
				.order("label", VOICING_ORDER)
				.eq("root", root)
				.eq("suffix", suffix)
				// A chord the library does not carry is an answer (null), not an error.
				.maybeSingle(),
		),
	["chords:getChord"],
	CACHE_OPTS,
);

export const getChordsByRoot = unstable_cache(
	async (root: string): Promise<ChordWithVoicings[]> =>
		rows<ChordWithVoicings[] | null>(
			await publicClient()
				.from("chords")
				.select(VOICING_FIELDS)
				.order("label", VOICING_ORDER)
				.eq("root", root),
		) ?? [],
	["chords:getChordsByRoot"],
	CACHE_OPTS,
);

export const getAllChordsWithVoicings = unstable_cache(
	async (): Promise<ChordWithVoicings[]> =>
		rows<ChordWithVoicings[] | null>(
			await publicClient()
				.from("chords")
				.select(VOICING_FIELDS)
				.order("label", VOICING_ORDER)
				.order("root")
				.order("suffix"),
		) ?? [],
	["chords:getAllChordsWithVoicings"],
	CACHE_OPTS,
);

/** One quality in every key, for the hub's "By quality" view. */
export const getChordsBySuffix = unstable_cache(
	async (suffix: string): Promise<ChordWithVoicings[]> =>
		rows<ChordWithVoicings[] | null>(
			await publicClient()
				.from("chords")
				.select(VOICING_FIELDS)
				.order("label", VOICING_ORDER)
				.eq("suffix", suffix),
		) ?? [],
	["chords:getChordsBySuffix"],
	CACHE_OPTS,
);

// Browsable (root, suffix) pairs for the search palette.
export const getChordIndex = unstable_cache(
	async (): Promise<ChordIndexEntry[]> => {
		const data = rows<{ root: string; suffix: string }[] | null>(
			await publicClient().from("chords").select("root, suffix"),
		);
		return (data ?? [])
			.filter((c) => isBrowsableSuffix(c.suffix))
			.map((c) => ({ root: c.root, suffix: c.suffix }));
	},
	["chords:getChordIndex"],
	CACHE_OPTS,
);
