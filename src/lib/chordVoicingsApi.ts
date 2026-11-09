import type { ChordVoicing } from "@/lib/chordVoicing";
import type { ChordWithVoicings } from "@/lib/chordsData";

/**
 * The wire between the browser's voicing cache and `/api/chords/voicings`
 * (#463): the shared chord shapes come from our own origin, read on the server
 * from its cached copy of the library, so a visitor's own link to Supabase no
 * longer decides whether a shape appears.
 */

export const VOICINGS_ENDPOINT = "/api/chords/voicings";
/** Chords one request may ask for; the cache splits a longer batch. */
export const MAX_CHORDS_PER_REQUEST = 40;
/** How long the browser waits on one request before calling it failed. */
export const VOICINGS_TIMEOUT_MS = 8000;

export interface ChordKey {
	root: string;
	suffix: string;
}

/** The answer: each chord asked for, keyed as `voicingCacheKey` keys it; one the library lacks maps to []. */
export interface VoicingsResponse {
	voicings: Record<string, ChordVoicing[]>;
}

export function voicingCacheKey(root: string, suffix: string): string {
	return `${root} ${suffix}`;
}

/** One chord as a `c` parameter: `root:suffix`. A root never holds a colon; a suffix may hold a slash. */
export function chordParam({ root, suffix }: ChordKey): string {
	return `${root}:${suffix}`;
}

const ROOT = /^[A-G][#b]?$/;
const MAX_SUFFIX_CHARS = 24;

/** The chords a query asks for, deduplicated, or null when it is not one this route answers. */
export function parseVoicingsQuery(params: URLSearchParams): ChordKey[] | null {
	const values = params.getAll("c");
	if (values.length === 0 || values.length > MAX_CHORDS_PER_REQUEST) return null;
	const chords = new Map<string, ChordKey>();
	for (const value of values) {
		const colon = value.indexOf(":");
		if (colon < 0) return null;
		const root = value.slice(0, colon);
		const suffix = value.slice(colon + 1);
		if (!ROOT.test(root) || suffix.length === 0 || suffix.length > MAX_SUFFIX_CHARS) return null;
		chords.set(voicingCacheKey(root, suffix), { root, suffix });
	}
	return [...chords.values()];
}

/** A voicing as the browser caches it: the library's `note` is the chord page's alone. */
function asCached({ id, label, start_fret, barre_fret, capo, frets, fingers }: ChordVoicing): ChordVoicing {
	return { id, label, start_fret, barre_fret, capo, frets, fingers };
}

/** The library by chord, built once per cached copy of it. */
const indexes = new WeakMap<readonly ChordWithVoicings[], Map<string, ChordVoicing[]>>();

function libraryIndex(library: readonly ChordWithVoicings[]): Map<string, ChordVoicing[]> {
	let index = indexes.get(library);
	if (!index) {
		index = new Map(library.map((chord) => [voicingCacheKey(chord.root, chord.suffix), chord.chord_voicings.map(asCached)]));
		indexes.set(library, index);
	}
	return index;
}

/** The answer to `chords` from the whole library, in the order the chord pages show the shapes. */
export function voicingsFromLibrary(library: readonly ChordWithVoicings[], chords: readonly ChordKey[]): VoicingsResponse {
	const index = libraryIndex(library);
	const voicings: Record<string, ChordVoicing[]> = {};
	for (const { root, suffix } of chords) {
		const key = voicingCacheKey(root, suffix);
		voicings[key] = index.get(key) ?? [];
	}
	return { voicings };
}
