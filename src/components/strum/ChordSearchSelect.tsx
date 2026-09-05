"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Music, X } from "lucide-react";
import MusicalText from "@/components/MusicalText";
import { chordDisplayName } from "@/lib/chordSuffixes";
import { searchChords, type ChordIndexEntry, type ChordSearchResult } from "@/lib/chordSearch";
import type { ChordRef } from "@/lib/strumPatterns";

interface Props {
	chord: ChordRef | null;
	onChange: (chord: ChordRef | null) => void;
	/** Browsable (root, suffix) pairs. Empty while the index is still loading. */
	index: readonly ChordIndexEntry[];
	ariaLabel: string;
}

/**
 * Inline chord picker: a text input that searches the chord library and offers
 * matches in a dropdown. Shares the ranking with the /chords search palette
 * (searchChords), but stays in the flow instead of opening a dialog, so a bar
 * can be assigned without leaving the pattern editor.
 */
export default function ChordSearchSelect({ chord, onChange, index, ariaLabel }: Props) {
	const [query, setQuery] = useState("");
	const [editing, setEditing] = useState(false);
	const [highlighted, setHighlighted] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listboxId = useId();

	const results = useMemo(
		() => (editing ? searchChords(index, query) : []),
		[index, query, editing],
	);
	const open = editing && (results.length > 0 || query.trim() !== "");

	// Close on a press anywhere outside, the way the other in-modal popovers do.
	useEffect(() => {
		if (!editing) return;
		function handlePointerDown(e: PointerEvent) {
			if (!containerRef.current?.contains(e.target as Node)) stopEditing();
		}
		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [editing]);

	function stopEditing() {
		setEditing(false);
		setQuery("");
	}

	function commit(result: ChordSearchResult) {
		// Voicing is not chosen here — resolveBarChords falls back to the standard
		// shape, which is what the old picker defaulted to anyway.
		onChange({ root: result.root, suffix: result.suffix, voicingId: null });
		stopEditing();
		inputRef.current?.blur();
	}

	// Every key this widget acts on is also stopped: the enclosing dialog saves on
	// Enter and closes on Escape, and picking a chord out of the dropdown must do
	// neither of those on the way through.
	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			stopEditing();
			inputRef.current?.blur();
			return;
		}
		if (results.length === 0) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			e.stopPropagation();
			setHighlighted((i) => (i + 1) % results.length);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			e.stopPropagation();
			setHighlighted((i) => (i - 1 + results.length) % results.length);
		} else if (e.key === "Enter") {
			e.preventDefault();
			e.stopPropagation();
			const pick = results[highlighted];
			if (pick) commit(pick);
		}
	}

	const displayValue = editing
		? query
		: chord
			? chordDisplayName(chord.root, chord.suffix)
			: "";

	return (
		<div ref={containerRef} className="relative">
			<div
				className={`flex items-center gap-1.5 border px-2 py-1 transition-colors ${
					chord && !editing
						? "border-denim bg-denim-tint text-denim"
						: "border-line-strong text-ink-dim focus-within:border-denim"
				}`}
			>
				<Music size={10} className="shrink-0" />
				<input
					ref={inputRef}
					type="text"
					role="combobox"
					aria-expanded={open}
					aria-controls={listboxId}
					aria-label={ariaLabel}
					autoComplete="off"
					value={displayValue}
					placeholder="No chord"
					onFocus={() => setEditing(true)}
					onChange={(e) => {
						setEditing(true);
						setQuery(e.target.value);
						// A new query invalidates the previous highlight — start
						// again from the top match.
						setHighlighted(0);
					}}
					onKeyDown={handleKeyDown}
					className="w-24 bg-transparent font-mono text-[11px] font-semibold placeholder:font-normal placeholder:text-ink-dim focus:outline-none"
				/>
				{chord && !editing && (
					<button
						type="button"
						onClick={() => onChange(null)}
						aria-label={`Clear ${ariaLabel}`}
						title="Clear chord"
						className="shrink-0 text-denim transition-colors hover:text-destructive"
					>
						<X size={10} />
					</button>
				)}
			</div>

			{open && (
				<ul
					id={listboxId}
					role="listbox"
					className="absolute left-0 top-full z-50 mt-1 max-h-44 w-52 overflow-y-auto border border-line-strong bg-popover"
				>
					{results.map((r, i) => {
						const key = `${r.root} ${r.suffix}`;
						return (
							<li key={key}>
								<button
									type="button"
									role="option"
									aria-selected={i === highlighted}
									onMouseEnter={() => setHighlighted(i)}
									// pointerdown, not click: the outside-press listener would
									// otherwise close the list before the click landed.
									onPointerDown={(e) => {
										e.preventDefault();
										commit(r);
									}}
									className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors ${
										i === highlighted ? "bg-denim-tint" : ""
									}`}
								>
									<span className="font-mono text-[11px] font-semibold text-ink">
										<MusicalText text={chordDisplayName(r.root, r.suffix)} />
									</span>
									<span className="ml-auto font-mono text-[9px] text-ink-faint">
										{r.category}
									</span>
								</button>
							</li>
						);
					})}
					{results.length === 0 && (
						<li className="px-2 py-2 text-center font-mono text-[10px] text-ink-faint">
							{index.length === 0 ? "Loading chords…" : "No match"}
						</li>
					)}
				</ul>
			)}
		</div>
	);
}
