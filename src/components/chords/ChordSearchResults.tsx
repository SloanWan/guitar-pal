"use client";

import { useMemo } from "react";
import { ArrowRightIcon } from "lucide-react";

import { CommandGroup, CommandItem } from "@/components/ui/command";
import MusicalText from "@/components/MusicalText";
import ChordRequestButton from "@/components/chords/ChordRequestButton";
import { chordDisplayName } from "@/lib/chordSuffixes";
import { buildChordLookup, classifyBatchQuery } from "@/lib/chordBatchResolve";
import {
	searchChords,
	getNavShortcut,
	type ChordIndexEntry,
	type ChordSearchResult,
	type NavShortcut,
} from "@/lib/chordSearch";

// Trailing phrase for a category in a shortcut label: "minor" → "minor chords",
// "power chord" → "power chords" (avoids the doubled "power chord chords").
function categoryPhrase(category: string): string {
	const lower = category.toLowerCase();
	return /chord$/.test(lower) ? `${lower}s` : `${lower} chords`;
}

// cmdk addresses items by their `value`; declared here so the rows and the tests that
// assert on them share one definition. Lower-cased for case-stability — distinct
// (root, suffix) pairs stay distinct, since no two stored roots or suffixes differ only
// by case.
const BATCH_VALUE = "batch-grid";
const shortcutValue = (s: NavShortcut) => `jump-${s.kind}`;
const chordValue = (r: ChordSearchResult) => `${r.root} ${r.suffix}`.toLowerCase();

export interface ChordPaletteRows {
	readonly results: ChordSearchResult[];
	readonly shortcut: NavShortcut | null;
	readonly batch: ReturnType<typeof classifyBatchQuery>;
	readonly trimmed: string;
	readonly showChords: boolean;
}

// Computed once by the palette and handed to whichever surface is rendering, so the
// index lookup map is built once rather than per surface.
export function useChordPaletteRows(
	index: readonly ChordIndexEntry[],
	query: string,
): ChordPaletteRows {
	const results = useMemo(() => searchChords(index, query), [index, query]);
	const shortcut = useMemo(() => getNavShortcut(query), [query]);

	// Exact-lookup map for batch classification, so the per-keystroke check costs one
	// hash probe per token instead of a scan of the whole index.
	const lookup = useMemo(() => buildChordLookup(index), [index]);
	const batch = useMemo(() => classifyBatchQuery(lookup, query), [lookup, query]);

	return useMemo(() => {
		// Single-chord results are meaningless once the query has been read as a chord
		// list — "C Am F G" collapses to "camfg" in the single-chord parser.
		const showChords = !batch.shouldOffer && results.length > 0;
		return { results, shortcut, batch, trimmed: query.trim(), showChords };
	}, [results, shortcut, batch, query]);
}

interface Props {
	rows: ChordPaletteRows;
	onSelectChord: (result: ChordSearchResult) => void;
	onSelectShortcut: (shortcut: NavShortcut) => void;
	onSelectBatch: () => void;
}

// The rows of the chord palette, shared by the ⌘K dialog and the inline dropdown that
// drops upward out of the search pill. Renders CommandGroups only — each caller supplies
// its own CommandList so it can size and position the surface itself.
//
// DOM order is load-bearing, not cosmetic: cmdk highlights the first item in DOM order
// and re-asserts that on every keystroke (its Input schedules a "select first item" pass
// whenever the search string changes, which overrides even a controlled selection).
// Putting the concrete matches first is therefore the only stable way to keep the default
// highlight off the navigational "Jump to" row.
//
// Reading order therefore follows the DOM: concrete matches first, the "Jump to" browse
// shortcut last.
export default function ChordSearchResults({
	rows,
	onSelectChord,
	onSelectShortcut,
	onSelectBatch,
}: Props) {
	const { results, shortcut, batch, trimmed, showChords } = rows;

	return (
		<>
			{showChords && (
				<CommandGroup heading="Chords">
					{results.map((r) => {
						const key = chordValue(r);
						return (
							<CommandItem key={key} value={key} onSelect={() => onSelectChord(r)}>
								<span className="font-medium text-ink">
									<MusicalText text={chordDisplayName(r.root, r.suffix)} />
								</span>
								<span className="ml-auto text-xs text-ink-dim">{r.category}</span>
							</CommandItem>
						);
					})}
				</CommandGroup>
			)}

			{batch.shouldOffer && (
				<CommandGroup heading="Chords Result">
					<CommandItem value={BATCH_VALUE} onSelect={onSelectBatch}>
						<span className="flex flex-col gap-0.5">
							<span className="font-medium text-ink">
								{/* An explicit comma forces batch mode even when nothing
								    resolves, so the count can legitimately be 0 or 1. */}
								{batch.resolvedCount === 0
									? "Look these up as chords"
									: `Show ${batch.resolvedCount} chord${batch.resolvedCount === 1 ? "" : "s"} side by side`}
							</span>
							<span className="flex flex-wrap gap-x-1.5 text-xs text-ink-dim">
								{batch.tokens.map((t) =>
									t.status === "resolved" ? (
										// Stored spelling, so the user can see that Db resolved
										// to C# before they navigate.
										<MusicalText
											key={t.key}
											text={chordDisplayName(t.root, t.suffix)}
										/>
									) : (
										<span key={t.key} className="text-ink-faint line-through">
											{t.token}
										</span>
									),
								)}
							</span>
						</span>
						<ArrowRightIcon className="ml-auto size-4 text-ink-dim" />
					</CommandItem>
				</CommandGroup>
			)}

			{shortcut && (
				<CommandGroup heading="Jump to">
					<CommandItem
						value={shortcutValue(shortcut)}
						onSelect={() => onSelectShortcut(shortcut)}
					>
						<span className="font-medium text-ink">
							{shortcut.kind === "root" ? (
								<>
									Show all <MusicalText text={shortcut.root} /> chords
								</>
							) : shortcut.kind === "root-category" ? (
								<>
									Show all <MusicalText text={shortcut.root} />{" "}
									{categoryPhrase(shortcut.category)}
								</>
							) : (
								// "Power Chord" already ends in "Chord", so pluralise it rather
								// than tack on a second "chords".
								`Show all ${shortcut.category}${/chord/i.test(shortcut.category) ? "s" : " chords"}`
							)}
						</span>
						<ArrowRightIcon className="ml-auto size-4 text-ink-dim" />
					</CommandItem>
				</CommandGroup>
			)}

			{trimmed === "" && (
				<div className="flex flex-col items-center gap-1 px-4 py-6 text-center text-sm text-ink-dim">
					<p>Type a chord name to search.</p>
					<p className="text-xs">
						Several at once — <span className="text-ink">C Am F G</span> — opens them
						side by side; commas force it: <span className="text-ink">C, Am</span>
					</p>
				</div>
			)}

			{!batch.shouldOffer && trimmed !== "" && results.length === 0 && (
				<div className="flex flex-col items-center gap-3 px-4 py-6 text-center text-sm">
					<p className="text-ink-dim">
						No chord found for “<span className="text-ink">{trimmed}</span>”.
					</p>
					{/* Keyed on the query so a new search always gets a fresh button. */}
					<ChordRequestButton key={trimmed} query={trimmed} />
				</div>
			)}
		</>
	);
}
