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
import { isBrowsableSuffix, sortRoots } from "@/lib/chordSuffixes";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

export interface ChordWithVoicings {
	id: string;
	root: string;
	suffix: string;
	chord_voicings: ChordVoicing[];
}

const VOICING_FIELDS = `
  id, root, suffix,
  chord_voicings ( id, label, start_fret, barre_fret, capo, frets, fingers )
` as const;

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

export const getChord = unstable_cache(
	async (root: string, suffix: string): Promise<ChordWithVoicings | null> => {
		const { data } = await publicClient()
			.from("chords")
			.select(VOICING_FIELDS)
			.eq("root", root)
			.eq("suffix", suffix)
			.single();
		return data as ChordWithVoicings | null;
	},
	["chords:getChord"],
	CACHE_OPTS,
);

export const getChordsByRoot = unstable_cache(
	async (root: string): Promise<ChordWithVoicings[]> => {
		const { data } = await publicClient()
			.from("chords")
			.select(VOICING_FIELDS)
			.eq("root", root);
		return (data as ChordWithVoicings[] | null) ?? [];
	},
	["chords:getChordsByRoot"],
	CACHE_OPTS,
);

export const getAllChordsWithVoicings = unstable_cache(
	async (): Promise<ChordWithVoicings[]> => {
		const { data } = await publicClient()
			.from("chords")
			.select(VOICING_FIELDS)
			.order("root")
			.order("suffix");
		return (data as ChordWithVoicings[] | null) ?? [];
	},
	["chords:getAllChordsWithVoicings"],
	CACHE_OPTS,
);

// Sorted, de-duplicated root list for the `/chords` index selector.
export const getChordRoots = unstable_cache(
	async (): Promise<string[]> => {
		const { data } = await publicClient().from("chords").select("root");
		return sortRoots([...new Set((data ?? []).map((c) => c.root as string))]);
	},
	["chords:getChordRoots"],
	CACHE_OPTS,
);

// Browsable (root, suffix) pairs for the search palette — cached so the
// `/chords` layout no longer runs a per-request Supabase query (which, via
// cookies, would force the whole `/chords/*` subtree to render dynamically).
export const getChordIndex = unstable_cache(
	async (): Promise<ChordIndexEntry[]> => {
		const { data } = await publicClient().from("chords").select("root, suffix");
		const rows = (data ?? []) as { root: string; suffix: string }[];
		return rows
			.filter((c) => isBrowsableSuffix(c.suffix))
			.map((c) => ({ root: c.root, suffix: c.suffix }));
	},
	["chords:getChordIndex"],
	CACHE_OPTS,
);
