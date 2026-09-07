"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { useNavTransition } from "@/components/nav-progress";
import { chordHref } from "@/lib/chordSlug";
import { tocSectionId, tocSubsectionId } from "@/lib/chordToc";
import { batchGridHref } from "@/lib/chordBatchResolve";
import type { ChordSearchResult, NavShortcut } from "@/lib/chordSearch";

// Deep-links a browse shortcut into /chords/all via the shared tocSectionId anchors.
// Root (and root+category) shortcuts land on the default root-first grouping — where
// each root section carries per-category subsections (id "b-minor"); a bare category
// flips to the category-first grouping (?group=category) where its heading lives.
export function shortcutHref(s: NavShortcut): string {
	switch (s.kind) {
		case "root":
			return `/chords/all#${tocSectionId(s.root)}`;
		case "root-category":
			return `/chords/all#${tocSubsectionId(s.root, s.category)}`;
		case "category":
			return `/chords/all?group=category#${tocSectionId(s.category)}`;
	}
}

export interface ChordSearchNavigation {
	/**
	 * `shape` addresses one chord among the unnamed, which all share a name. It
	 * is ignored for a chord that has one.
	 */
	goToChord: (result: ChordSearchResult, shape?: string) => void;
	goToBrowse: (shortcut: NavShortcut) => void;
	/** Multi-chord queries leave the palette for the batch grid. */
	goToGrid: (query: string) => void;
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
	const router = useRouter();
	const startNav = useNavTransition();

	const navigate = useCallback(
		(href: string) => {
			onNavigate();
			// Inside a transition, so the global progress bar takes over while the
			// destination route is in flight.
			startNav(() => router.push(href));
		},
		[onNavigate, router, startNav],
	);

	const goToChord = useCallback(
		(r: ChordSearchResult, shape?: string) => navigate(chordHref(r.root, r.suffix, shape)),
		[navigate],
	);
	const goToBrowse = useCallback((s: NavShortcut) => navigate(shortcutHref(s)), [navigate]);
	// A grid of diagrams does not belong inside a command list (and its voicing
	// modal would nest inside the dialog), so the palette routes there instead.
	const goToGrid = useCallback((query: string) => navigate(batchGridHref(query.trim())), [
		navigate,
	]);

	// The only way in: /chords/create is linked from nowhere else, and without a
	// shape in the URL it has nothing to write down.
	const goToCreateChord = useCallback(
		(frets: string) => navigate(`/chords/create?frets=${encodeURIComponent(frets.trim())}`),
		[navigate],
	);

	return { goToChord, goToBrowse, goToGrid, goToCreateChord };
}
