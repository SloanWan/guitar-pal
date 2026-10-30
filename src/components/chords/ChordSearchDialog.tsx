"use client";

import { useCallback, useEffect, useState } from "react";
import { Command as Cmdk } from "cmdk";
import { SearchIcon, XIcon } from "lucide-react";

import "@/components/playback/playback.css";
import "@/components/playback/icons.css";
import "./chord-search.css";
import { Command, CommandList } from "@/components/ui/command";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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

	const { goToChord, goToBrowse, goToBoard, goToCreateChord } =
		useChordSearchNavigation(close);
	const rows = useChordPaletteRows(index, query);

	const handleOpenChange = useCallback((next: boolean) => {
		setOpen(next);
		if (!next) setQuery("");
	}, []);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				data-m="chords"
				showCloseButton={false}
				// Hung from a fixed line, not centred: typing moves only the bottom edge.
				className="top-[12dvh] translate-y-0 gap-0 overflow-hidden rounded-gp-xl p-0 sm:max-w-[560px]"
			>
				<DialogTitle className="sr-only">Chord search</DialogTitle>
				<DialogDescription className="sr-only">
					Search the chord library by name — try Cmaj7, F#m7b5, or C/G. Type several chords to compare them side
					by side.
				</DialogDescription>
				<Command shouldFilter={false} label="Chord search" className="rounded-none bg-transparent">
					<div className="ck-head">
						<SearchIcon aria-hidden className="ck-glass" />
						<Cmdk.Input
							value={query}
							onValueChange={setQuery}
							className="ck-input"
							placeholder={index.length === 0 ? "Loading chords…" : "Search chords — e.g. Cmaj7, or C Am F G"}
						/>
						<DialogClose asChild>
							<button type="button" className="pb-icon" data-anim="close" aria-label="Close">
								<XIcon aria-hidden />
							</button>
						</DialogClose>
					</div>
					<CommandList className="ck-list max-h-[min(420px,56dvh)]">
						<ChordSearchResults
							rows={rows}
							onSelectChord={goToChord}
							onSelectShortcut={goToBrowse}
							onSelectBatch={() => goToBoard(query)}
							onCreateChord={goToCreateChord}
						/>
					</CommandList>
					<div className="ck-foot" aria-hidden>
						<span>
							<kbd className="ck-kbd">↑</kbd>
							<kbd className="ck-kbd">↓</kbd>
							Move
						</span>
						<span>
							<kbd className="ck-kbd">↵</kbd>
							Open
						</span>
						<span>
							<kbd className="ck-kbd">esc</kbd>
							Close
						</span>
					</div>
				</Command>
			</DialogContent>
		</Dialog>
	);
}
