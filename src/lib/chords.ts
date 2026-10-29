"use server";

// Server Action wrappers around the cached chord reads in `chordsData.ts` that
// client components ("use client") make — they invoke these over the wire, which
// requires the "use server" boundary. Server Components should import from
// `chordsData.ts` directly to skip the action round-trip. Both paths share one
// cache entry, since these delegate straight to the cached functions. Reads only
// Server Components make have no wrapper here.

import {
	getAllChordsWithVoicings as getAllChordsWithVoicingsCached,
	getChordIndex as getChordIndexCached,
	getChordsByRoot as getChordsByRootCached,
	type ChordWithVoicings,
} from "@/lib/chordsData";
import type { ChordIndexEntry } from "@/lib/chordSearch";

// NOTE: a "use server" module may only export async functions. A re-exported
// type here is compiled as a value export and blows up at module evaluation, so
// consumers import types straight from chordsData / chordSearch — type-only
// imports, erased before they reach the client.

/** The whole library, for shape search. Loaded lazily by `useChordShapeMatches`. */
export async function getAllChordsWithVoicings(): Promise<ChordWithVoicings[]> {
	return getAllChordsWithVoicingsCached();
}

export async function getChordIndex(): Promise<ChordIndexEntry[]> {
	return getChordIndexCached();
}

/** One root's chords, for the chord page's library when the player picks another root. */
export async function getChordsByRoot(root: string): Promise<ChordWithVoicings[]> {
	return getChordsByRootCached(root);
}
