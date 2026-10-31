import { classifyBatchQuery, type BatchToken, type ChordLookup } from "@/lib/chordBatchResolve";
import {
	getNavShortcut,
	searchChords,
	type ChordIndexEntry,
	type ChordSearchResult,
	type NavShortcut,
} from "@/lib/chordSearch";
import type { ShapeFret } from "@/lib/chordShape";
import { parseTabSequence } from "@/lib/chordTabSequence";

/**
 * What the chords hub's search reads a query as, before anything is fetched:
 * six frets, several chords, chord names, or nothing it knows. A shape's matches
 * need the whole library, so they are looked up by the caller.
 */
export type Reading =
	| { readonly kind: "empty" }
	| { readonly kind: "shape"; readonly frets: ShapeFret[] }
	| { readonly kind: "batch"; readonly tokens: readonly BatchToken[] }
	| { readonly kind: "names"; readonly results: ChordSearchResult[]; readonly shortcut: NavShortcut | null }
	| { readonly kind: "none" };

const NAME_LIMIT = 6;

export function readQuery(query: string, index: readonly ChordIndexEntry[], lookup: ChordLookup): Reading {
	if (query.trim() === "") return { kind: "empty" };
	const { frets } = parseTabSequence(query);
	if (frets) return { kind: "shape", frets };
	const batch = classifyBatchQuery(lookup, query);
	if (batch.shouldOffer) return { kind: "batch", tokens: batch.tokens };
	const results = searchChords(index, query, NAME_LIMIT);
	const shortcut = getNavShortcut(query);
	if (results.length > 0 || shortcut) return { kind: "names", results, shortcut };
	return { kind: "none" };
}
