"use client";

import { useEffect, useMemo, useState } from "react";
import { parseTabSequence } from "@/lib/chordTabSequence";
import {
	searchChordsByShape,
	type ShapeMatch,
	type ShapeSearchChord,
} from "@/lib/chordShapeSearch";
import type { ShapeFret } from "@/lib/chordShape";

/**
 * The chords played with the shape someone typed into the search.
 *
 * Tabs give the grip and often never name it, so the six frets are a search
 * query in their own right. Nothing is fetched until one is actually typed: the
 * whole library with its voicings is a far larger thing than the name index the
 * palette normally searches, and almost every search is a name.
 */

/**
 * The library, fetched at most once per session however many palettes ask.
 * A failed fetch is not kept, so the next shape typed tries again.
 */
let libraryRequest: Promise<ShapeSearchChord[]> | null = null;

function loadLibrary(): Promise<ShapeSearchChord[]> {
	libraryRequest ??= (async () => {
		// Imported here rather than at the top of the module so the palette does not
		// pull the whole-library server action into its own chunk for the many
		// searches that never need it.
		const { getAllChordsWithVoicings } = await import("@/lib/chords");
		return getAllChordsWithVoicings();
	})().catch((err: unknown) => {
		libraryRequest = null;
		throw err;
	});
	return libraryRequest;
}

export interface ChordShapeMatches {
	/** The frets that were typed, low E first, or null if the query is not one. */
	target: ShapeFret[] | null;
	matches: ShapeMatch[];
	/** A shape was typed and the library is still on its way. */
	loading: boolean;
}

export function useChordShapeMatches(query: string): ChordShapeMatches {
	// Memoized so the array identity tracks the query rather than the render, or
	// the effect below would refire on every keystroke's worth of re-rendering.
	const target = useMemo(() => parseTabSequence(query).frets, [query]);
	const [library, setLibrary] = useState<ShapeSearchChord[] | null>(null);

	useEffect(() => {
		if (target === null || library !== null) return;
		let cancelled = false;
		loadLibrary()
			.then((chords) => {
				if (!cancelled) setLibrary(chords);
			})
			.catch((err: unknown) => {
				// The name search still works; a shape search that cannot reach the
				// library simply finds nothing.
				console.error("[useChordShapeMatches] library load failed:", err);
			});
		return () => {
			cancelled = true;
		};
	}, [target, library]);

	const matches = useMemo(
		() => (target && library ? searchChordsByShape(library, target) : []),
		[target, library],
	);

	return { target, matches, loading: target !== null && library === null };
}
