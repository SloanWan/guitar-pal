"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";

import { Command, CommandList } from "@/components/ui/command";
import ChordSearchResults, { useChordPaletteRows } from "@/components/chords/ChordSearchResults";
import { useChordSearchNavigation } from "@/components/chords/useChordSearchNavigation";
import type { ChordIndexEntry } from "@/lib/chordSearch";

export default function ChordSearch({ index }: { index: readonly ChordIndexEntry[] }) {
	// The pill: the inline dropdown that grows out of it, over the same index the
	// app-wide ⌘K dialog searches (ChordSearchDialog, mounted in the main layout).
	const [inlineOpen, setInlineOpen] = useState(false);
	const [query, setQuery] = useState("");
	const inlineRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Browser-only platform hint. Lazily read on first render; on the server it
	// resolves to false, so the <kbd> is marked suppressHydrationWarning to absorb
	// the one-render text difference rather than churning state in an effect.
	const [isMac] = useState(
		() =>
			typeof navigator !== "undefined" &&
			/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent),
	);

	const closeInline = useCallback(() => {
		setInlineOpen(false);
		setQuery("");
	}, []);

	// Dismiss the inline dropdown on an outside press. Only listens while it is open,
	// so there is no idle document-level handler.
	useEffect(() => {
		if (!inlineOpen) return;
		function onPointerDown(e: MouseEvent | TouchEvent) {
			const el = inlineRef.current;
			if (el && e.target instanceof Node && !el.contains(e.target)) closeInline();
		}
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("touchstart", onPointerDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("touchstart", onPointerDown);
		};
	}, [inlineOpen, closeInline]);

	// Closed immediately on select, so it never sits open and inert while the
	// destination route is in flight.
	const { goToChord, goToBrowse, goToGrid } = useChordSearchNavigation(closeInline);

	// Collapsed the pill is a plain circle; expanded (hovered, or opened for typing) it
	// widens and washes in a low-alpha denim gradient — the brand hue at tint strength,
	// not a solid fill, so the pill stays light and its text stays ink-dark. No border in
	// either state: a 1px ring sits outside the gradient's box and reads as a seam.
	// Computed once here and handed to whichever surface is rendering, so the index
	// lookup map is built once rather than per surface.
	const rows = useChordPaletteRows(index, query);

	// The dropdown is mounted as soon as the pill opens but only revealed once there is
	// something to list, so its entrance can transition instead of popping in.
	const inlineListOpen = inlineOpen && query.trim() !== "";

	const pillState = inlineOpen
		? "cursor-text w-[21.5rem] shadow-none before:opacity-100 after:opacity-30"
		: "w-14 shadow-[0_10px_25px_rgba(0,0,0,0.10)] before:opacity-0 after:opacity-0 hover:w-[21.5rem] hover:shadow-none hover:before:opacity-100 hover:after:opacity-30";

	return (
		<>
			<div
				ref={inlineRef}
				className="relative"
				onKeyDown={(e) => {
					if (e.key === "Escape" && inlineOpen) closeInline();
				}}
			>
				<Command
					shouldFilter={false}
					label="Chord search"
					className="h-auto w-auto overflow-visible rounded-none bg-transparent"
				>
					{/* Drops upward: the pill is anchored to the bottom of the viewport, so the
					    list scales up out of its own bottom edge and settles the last few
					    pixels into place. Held back until something has been typed — an empty
					    dropdown carrying only a "type a chord name" hint is a card that says
					    nothing the placeholder hasn't already said. The ⌘K dialog keeps that
					    hint: it opens onto an otherwise blank surface. Width tracks the
					    expanded pill (w-[21.5rem]) so the two line up. */}
					{inlineOpen && (
						<CommandList
							aria-hidden={!inlineListOpen}
							className={`absolute bottom-full left-1/2 mb-3 max-h-[60vh] w-[21.5rem] origin-bottom rounded-2xl bg-popover py-1 shadow-[0_12px_36px_rgba(0,0,0,0.20)] transition-[opacity,transform] duration-300 ease-out ${
								inlineListOpen
									? "-translate-x-1/2 translate-y-0 scale-100 opacity-100"
									: "pointer-events-none -translate-x-1/2 translate-y-2 scale-95 opacity-0"
							}`}
						>
							<ChordSearchResults
								rows={rows}
								onSelectChord={goToChord}
								onSelectShortcut={goToBrowse}
								onSelectBatch={() => goToGrid(query)}
							/>
						</CommandList>
					)}

					{/* Expanding affordance: a round icon button that widens on hover to reveal
					    its label, and turns into a text field when clicked. The gradient fill
					    and glow are the pill's OWN pseudo-elements, so they use hover: rather
					    than group-hover: (group-hover targets descendants of .group, which a
					    pseudo-element of .group itself is not). Touch devices never hover: a
					    tap expands the pill and focuses the field in one step. */}
					<div
						className={`group relative flex h-14 items-center rounded-full bg-surface pl-4 transition-[width,box-shadow] duration-500 ease-out
							before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-br before:from-denim/12 before:to-denim-accent/25 before:transition-opacity before:duration-500
							after:absolute after:inset-x-0 after:top-2.5 after:-z-10 after:h-full after:rounded-full after:bg-gradient-to-br after:from-denim after:to-denim-accent after:blur-[15px] after:transition-opacity after:duration-500
							${pillState}`}
						onClick={inlineOpen ? () => inputRef.current?.focus() : undefined}
					>
						<SearchIcon
							className={`relative size-6 shrink-0 transition-colors duration-500 ${
								inlineOpen
									? "text-denim-accent"
									: "text-ink-dim group-hover:text-denim-accent"
							}`}
						/>

						{inlineOpen ? (
							// cmdk's own input, not the ui/command wrapper — that one ships a
							// bordered row with a second search icon, which this pill supplies.
							<CommandPrimitive.Input
								ref={inputRef}
								autoFocus
								value={query}
								onValueChange={setQuery}
								placeholder="Cmaj7, or C Am F G"
								aria-label="Search chords"
								className="relative ml-3 w-full bg-transparent pr-6 text-sm font-medium text-ink caret-denim outline-none placeholder:text-ink-faint"
							/>
						) : (
							<>
								{/* Scaled from the left rather than faded in place, so the label
								    unfurls out of the icon as the pill grows. Transform carries no
								    layout width, so the collapsed circle stays a circle. */}
								<span className="pointer-events-none relative ml-3 inline-flex origin-left scale-x-0 items-center gap-2 whitespace-nowrap text-sm font-medium text-denim-accent opacity-0 transition-[transform,opacity] duration-500 group-hover:scale-x-100 group-hover:opacity-100 group-hover:delay-[150ms]">
									Search Chord or Chords in a batch
									<kbd
										suppressHydrationWarning
										className="rounded border border-denim/30 bg-denim/10 px-1.5 py-0.5 font-sans text-[10px]"
									>
										{isMac ? "⌘K" : "Ctrl K"}
									</kbd>
								</span>
								<button
									type="button"
									onClick={() => setInlineOpen(true)}
									aria-label="Search chords"
									title="Search a chord, or several chords at once"
									className="absolute inset-0 cursor-text rounded-full"
								/>
							</>
						)}
					</div>
				</Command>
			</div>
		</>
	);
}
