"use client";

import { useCallback, useEffect, useState } from "react";

import { CommandDialog, CommandInput, CommandList } from "@/components/ui/command";
import ChordSearchResults, { useChordPaletteRows } from "@/components/chords/ChordSearchResults";
import { useChordSearchNavigation } from "@/components/chords/useChordSearchNavigation";
import { getChordIndex } from "@/lib/chords";
import { isModalOpen, isTypingTarget } from "@/lib/keyboardShortcuts";
import type { ChordIndexEntry } from "@/lib/chordSearch";

/**
 * The ⌘K chord palette, mounted once for the whole app rather than only under
 * /chords — a chord is something you want to look up mid-practice, from the
 * strum page or the fingerpick page, without navigating away first.
 *
 * The index is fetched the first time the dialog opens, not on every page load:
 * a page nobody presses ⌘K on pays nothing for it, and the read is cached
 * server-side, so the second session's dialog opens on data it already has.
 */
export default function ChordSearchDialog() {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [index, setIndex] = useState<readonly ChordIndexEntry[]>([]);

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
			// Typing fields keep ⌘K only where the browser or the field would use it;
			// here the palette is the point, so only the palette's own input is spared.
			if (!open && isTypingTarget(e.target)) return;
			// Another dialog is up and owns the keyboard — except this one, which
			// toggles closed.
			if (!open && isModalOpen()) return;
			e.preventDefault();
			setQuery("");
			setOpen((o) => !o);
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open]);

	useEffect(() => {
		if (!open || index.length > 0) return;
		let cancelled = false;
		getChordIndex()
			.then((fetched) => {
				if (!cancelled) setIndex(fetched);
			})
			.catch((e: unknown) => console.error("[ChordSearchDialog] chord index:", e));
		return () => {
			cancelled = true;
		};
	}, [open, index.length]);

	const close = useCallback(() => {
		setOpen(false);
		setQuery("");
	}, []);

	const { goToChord, goToBrowse, goToGrid } = useChordSearchNavigation(close);
	const rows = useChordPaletteRows(index, query);

	const handleOpenChange = useCallback((next: boolean) => {
		setOpen(next);
		if (!next) setQuery("");
	}, []);

	return (
		<CommandDialog
			open={open}
			onOpenChange={handleOpenChange}
			shouldFilter={false}
			title="Chord search"
			description="Search the chord library by name — try Cmaj7, F#m7b5, or C/G. Type several chords to compare them side by side."
		>
			<CommandInput
				value={query}
				onValueChange={setQuery}
				placeholder={
					index.length === 0
						? "Loading chords…"
						: "Search chords — e.g. Cmaj7, or C Am F G"
				}
			/>
			<CommandList>
				<ChordSearchResults
					rows={rows}
					onSelectChord={goToChord}
					onSelectShortcut={goToBrowse}
					onSelectBatch={() => goToGrid(query)}
				/>
			</CommandList>
		</CommandDialog>
	);
}
