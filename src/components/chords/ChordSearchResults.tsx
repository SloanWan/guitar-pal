"use client";

import { useMemo } from "react";
import { ArrowRightIcon } from "lucide-react";

import { CommandGroup, CommandItem } from "@/components/ui/command";
import MusicalText from "@/components/MusicalText";
import ChordRequestButton from "@/components/chords/ChordRequestButton";
import { useChordShapeMatches, type ChordShapeMatches } from "@/components/chords/useChordShapeMatches";
import { formatTabSequence } from "@/lib/chordTabSequence";
import type { ShapeMatch } from "@/lib/chordShapeSearch";
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
const shapeValue = (m: ShapeMatch) => `shape-${m.root} ${m.suffix}`.toLowerCase();

/**
 * What the palette can be asked, one row each: what to type, and what typing it
 * looks like. Written as data rather than three differently-shaped paragraphs so
 * every way in reads the same way down the card.
 */
/** The shape of C major, and the one example a shape hint is written with. */
const SHAPE_EXAMPLE = "01023x";

const SEARCH_HINTS: readonly { readonly ask: string; readonly example: string }[] = [
	{ ask: "Search by name", example: "Am7" },
	{ ask: "Several at once, side by side — a comma forces it", example: "C Am F G" },
	// A tab that names no chord is still searchable: paste the grip.
	{ ask: "Or by shape, frets first string first", example: SHAPE_EXAMPLE },
];

/**
 * A note the palette shows in place of rows: nothing typed yet, nothing found,
 * still looking. One container for all of them, so the four things this card can
 * say are laid out and spaced the same way rather than each in its own style.
 */
function PaletteNote({ children }: { children: React.ReactNode }) {
	return <div className="flex flex-col px-4 py-2">{children}</div>;
}

/** The lead sentence of a note. */
function NoteLead({ children }: { children: React.ReactNode }) {
	return <p className="py-2.5 text-sm leading-snug text-ink-dim">{children}</p>;
}

/**
 * One line of the note: what can be asked on the left, what it looks like typed
 * on the right, hairline-divided from whatever came before it.
 */
function NoteRow({ ask, example }: { ask: string; example: string }) {
	return (
		<div className="flex items-baseline justify-between gap-4 border-t border-line py-2.5 first:border-t-0">
			<span className="min-w-0 text-xs leading-snug text-ink-dim">{ask}</span>
			<span className="shrink-0 font-mono text-xs tracking-[0.08em] text-ink">{example}</span>
		</div>
	);
}

/** How a shape answered, in the words a player would use. */
function shapeMatchNote(match: ShapeMatch["match"]): string {
	if (match.kind === "exact") return "same shape";
	if (match.kind === "near") {
		return match.differences === 1 ? "one string differs" : `${match.differences} strings differ`;
	}
	const frets = Math.abs(match.semitones);
	return `same grip, ${frets} fret${frets === 1 ? "" : "s"} ${match.semitones > 0 ? "up" : "down"}`;
}

export interface ChordPaletteRows {
	readonly results: ChordSearchResult[];
	readonly shortcut: NavShortcut | null;
	readonly batch: ReturnType<typeof classifyBatchQuery>;
	readonly trimmed: string;
	readonly showChords: boolean;
	/** Chords played with the shape typed, when the query is a shape at all. */
	readonly shape: ChordShapeMatches;
}

// Computed once by the palette and handed to whichever surface is rendering, so the
// index lookup map is built once rather than per surface.
export function useChordPaletteRows(
	index: readonly ChordIndexEntry[],
	query: string,
): ChordPaletteRows {
	const results = useMemo(() => searchChords(index, query), [index, query]);
	const shortcut = useMemo(() => getNavShortcut(query), [query]);
	// Six frets are a query of their own: a tab that names no chord can be pasted
	// straight in. Nothing is fetched unless one actually is.
	const shape = useChordShapeMatches(query);

	// Exact-lookup map for batch classification, so the per-keystroke check costs one
	// hash probe per token instead of a scan of the whole index.
	const lookup = useMemo(() => buildChordLookup(index), [index]);
	const batch = useMemo(() => classifyBatchQuery(lookup, query), [lookup, query]);

	return useMemo(() => {
		// Single-chord results are meaningless once the query has been read as a chord
		// list — "C Am F G" collapses to "camfg" in the single-chord parser.
		// A shape is read the same way: "0-1-0-2-2-0" is six frets, not six chords.
		const isShape = shape.target !== null;
		const showChords = !batch.shouldOffer && !isShape && results.length > 0;
		return { results, shortcut, batch, trimmed: query.trim(), showChords, shape };
	}, [results, shortcut, batch, query, shape]);
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
	const { results, shortcut, batch, trimmed, showChords, shape } = rows;
	const isShape = shape.target !== null;

	return (
		<>
			{/* First in DOM order, because cmdk highlights the first row: a player who
			    pasted a grip and pressed Enter means the chord it is, not a browse
			    shortcut the six characters happened to look like. */}
			{isShape && shape.matches.length > 0 && (
				<CommandGroup heading="Chords with this shape">
					{shape.matches.map((m) => (
						<CommandItem
							key={shapeValue(m)}
							value={shapeValue(m)}
							onSelect={() =>
								onSelectChord({ root: m.root, suffix: m.suffix, category: m.category })
							}
						>
							<span className="flex min-w-0 flex-col gap-0.5">
								<span className="font-medium text-ink">
									<MusicalText text={chordDisplayName(m.root, m.suffix)} />
								</span>
								<span className="font-mono text-xs tracking-[0.12em] text-ink-dim">
									{formatTabSequence(m.frets)}
								</span>
							</span>
							<span className="ml-auto shrink-0 text-xs text-ink-dim">
								{shapeMatchNote(m.match)}
							</span>
						</CommandItem>
					))}
				</CommandGroup>
			)}

			{isShape && shape.loading && (
				<PaletteNote>
					<NoteLead>Looking for that shape…</NoteLead>
				</PaletteNote>
			)}

			{isShape && !shape.loading && shape.matches.length === 0 && (
				<PaletteNote>
					<NoteLead>
						No chord in the library is held like{" "}
						<span className="font-mono text-ink">{trimmed}</span>.
					</NoteLead>
					<NoteRow ask="Frets are read first string first" example={SHAPE_EXAMPLE} />
				</PaletteNote>
			)}

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

			{batch.shouldOffer && !isShape && (
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

			{shortcut && !isShape && (
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

			{trimmed === "" && !isShape && (
				<PaletteNote>
					{SEARCH_HINTS.map((hint) => (
						<NoteRow key={hint.example} ask={hint.ask} example={hint.example} />
					))}
				</PaletteNote>
			)}

			{!batch.shouldOffer && !isShape && trimmed !== "" && results.length === 0 && (
				<PaletteNote>
					<NoteLead>
						No chord found for “<span className="text-ink">{trimmed}</span>”.
					</NoteLead>
					{/* Keyed on the query so a new search always gets a fresh button. */}
					<div className="border-t border-line py-2.5">
						<ChordRequestButton key={trimmed} query={trimmed} />
					</div>
				</PaletteNote>
			)}
		</>
	);
}
