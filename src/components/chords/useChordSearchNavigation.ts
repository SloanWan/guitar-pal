"use client";

import { useCallback } from "react";

import { useNavPush } from "@/components/nav-progress";
import { chordHref, rootToSlug } from "@/lib/chordSlug";
import { boardHref } from "@/lib/chordBatchResolve";
import { CHORD_SUFFIX_CATEGORIES } from "@/lib/chordSuffixes";
import type { ChordSearchResult, NavShortcut } from "@/lib/chordSearch";
import { hubCategoryId, hubQualityHref } from "@/lib/chordsHub";

/** Where a browse shortcut lands on the chords hub: a root's chords, or one quality in every key. */
export function shortcutHref(s: NavShortcut): string {
	switch (s.kind) {
		case "root":
			return `/chords/${rootToSlug(s.root)}`;
		case "root-category":
			return `/chords/${rootToSlug(s.root)}#${hubCategoryId(s.category)}`;
		case "category": {
			const first = CHORD_SUFFIX_CATEGORIES.find((c) => c.category === s.category)?.suffixes[0] ?? "major";
			return hubQualityHref(first);
		}
	}
}

export interface ChordSearchNavigation {
	goToChord: (result: ChordSearchResult) => void;
	goToBrowse: (shortcut: NavShortcut) => void;
	/** Several chords at once go on the board. */
	goToBoard: (query: string) => void;
	/** A shape nothing in the library is held with can be written down instead. */
	goToCreateChord: (frets: string) => void;
}

/**
 * Where the chord palette's rows lead. Shared by the two surfaces over the same
 * index — the bottom pill on /chords and the global ⌘K dialog — so a row goes
 * to the same place whichever one raised it.
 *
 * `onNavigate` is called first, for a surface that has to close itself.
 */
export function useChordSearchNavigation(onNavigate: () => void): ChordSearchNavigation {
	const push = useNavPush();

	const navigate = useCallback(
		(href: string) => {
			onNavigate();
			// Through the progress bar, which takes over while the destination route
			// is in flight.
			push(href);
		},
		[onNavigate, push],
	);

	const goToChord = useCallback(
		(r: ChordSearchResult) => navigate(chordHref(r.root, r.suffix)),
		[navigate],
	);
	const goToBrowse = useCallback((s: NavShortcut) => navigate(shortcutHref(s)), [navigate]);
	const goToBoard = useCallback((query: string) => navigate(boardHref(query)), [navigate]);

	// The only way in: /chords/create is linked from nowhere else, and without a
	// shape in the URL it has nothing to write down.
	const goToCreateChord = useCallback(
		(frets: string) => navigate(`/chords/create?frets=${encodeURIComponent(frets.trim())}`),
		[navigate],
	);

	return { goToChord, goToBrowse, goToBoard, goToCreateChord };
}
