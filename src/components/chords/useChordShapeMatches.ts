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

/**
 * Every chord a shape can be matched against: the library, plus the player's own.
 *
 * Nothing is fetched while `enabled` is false, so the many searches and
 * sequences that are only names cost no round trip at all. The player's shapes
 * are re-read whenever `enabled` turns on, so one written a moment ago on
 * another page is already in hand.
 */
export function useChordShapeCorpus(enabled: boolean): ShapeSearchChord[] | null {
	const [library, setLibrary] = useState<ShapeSearchChord[] | null>(null);
	const [mine, setMine] = useState<readonly UserChordVoicing[]>([]);

	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;

		if (library === null) {
			loadLibrary()
				.then((chords) => {
					if (!cancelled) setLibrary(chords);
				})
				.catch((err: unknown) => {
					// Whatever asked still works on names alone; shapes simply find
					// nothing.
					console.error("[useChordShapeCorpus] library load failed:", err);
				});
		}

		loadUserVoicings()
			.then((voicings) => {
				if (!cancelled) setMine(voicings);
			})
			.catch((err: unknown) => {
				console.error("[useChordShapeCorpus] own shapes load failed:", err);
			});

		return () => {
			cancelled = true;
		};
	}, [enabled, library]);

	return useMemo(
		() => (library === null ? null : withUserChords(library, mine)),
		[library, mine],
	);
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
	// the corpus effect would refire on every keystroke's worth of re-rendering.
	const target = useMemo(() => parseTabSequence(query).frets, [query]);
	const corpus = useChordShapeCorpus(target !== null);

	const matches = useMemo(
		() => (target && corpus ? searchChordsByShape(corpus, target) : []),
		[target, corpus],
	);

	return { target, matches, loading: target !== null && corpus === null };
}
