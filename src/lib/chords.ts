"use server";

// Server Action wrappers around the cached chord reads in `chordsData.ts`.
// Client components ("use client") import these and invoke them over the wire,
// which requires the "use server" boundary. Server Components should import from
// `chordsData.ts` directly to skip the action round-trip. Both paths share one
// cache entry, since these delegate straight to the cached functions.

import {
	getChord as getChordCached,
	getChordsByRoot as getChordsByRootCached,
	getAllChordsWithVoicings as getAllChordsWithVoicingsCached,
	getChordIndex as getChordIndexCached,
	type ChordWithVoicings,
} from "@/lib/chordsData";
import type { ChordIndexEntry } from "@/lib/chordSearch";

// NOTE: a "use server" module may only export async functions. A re-exported
// type here is compiled as a value export and blows up at module evaluation
// ("ChordWithVoicings is not defined"), so consumers import the type straight
// from chordsData — a type-only import, erased before it reaches the client.

export async function getChord(
	root: string,
	suffix: string,
): Promise<ChordWithVoicings | null> {
	return getChordCached(root, suffix);
}

export async function getChordsByRoot(
	root: string,
): Promise<ChordWithVoicings[]> {
	return getChordsByRootCached(root);
}

export async function getAllChordsWithVoicings(): Promise<ChordWithVoicings[]> {
	return getAllChordsWithVoicingsCached();
}

export async function getChordIndex(): Promise<ChordIndexEntry[]> {
	return getChordIndexCached();
}
