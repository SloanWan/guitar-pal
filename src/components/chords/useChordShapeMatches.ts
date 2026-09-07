"use client";

import { useEffect, useMemo, useState } from "react";
import { loadUserVoicings } from "@/lib/userVoicingStore";
import { parseTabSequence } from "@/lib/chordTabSequence";
import {
	searchChordsByShape,
	withUserChords,
	type ShapeMatch,
	type ShapeSearchChord,
} from "@/lib/chordShapeSearch";
import type { ShapeFret } from "@/lib/chordShape";
import type { UserChordVoicing } from "@/lib/userChordVoicings";

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
	/**
	 * The player's own chords, searched alongside the library. Without them a
	 * shape they wrote themselves comes back as "not in the library", inviting
	 * them to write it a second time.
	 *
	 * Read through the store rather than the hook: this palette is mounted on
	 * every page in the app, and holding a live subscription to the player's
	 * shapes would mean an auth round trip on every page load for a search almost
	 * nobody runs. Re-read whenever a new shape is typed, so a chord written a
	 * moment ago on another page is already there.
	 */
	const [mine, setMine] = useState<readonly UserChordVoicing[]>([]);

	useEffect(() => {
		if (target === null) return;
		let cancelled = false;

		if (library === null) {
			loadLibrary()
				.then((chords) => {
					if (!cancelled) setLibrary(chords);
				})
				.catch((err: unknown) => {
					// The name search still works; a shape search that cannot reach the
					// library simply finds nothing.
					console.error("[useChordShapeMatches] library load failed:", err);
				});
		}

		loadUserVoicings()
			.then((voicings) => {
				if (!cancelled) setMine(voicings);
			})
			.catch((err: unknown) => {
				console.error("[useChordShapeMatches] own shapes load failed:", err);
			});

		return () => {
			cancelled = true;
		};
	}, [target, library]);

	const matches = useMemo(
		() =>
			target && library ? searchChordsByShape(withUserChords(library, mine), target) : [],
		[target, library, mine],
	);

	return { target, matches, loading: target !== null && library === null };
}
