"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Play, Plus, Search, X } from "lucide-react";
import "./chord-search-select.css";
import MusicalText from "@/components/MusicalText";
import { chordDisplayName } from "@/lib/chordSuffixes";
import {
	normalizeChordName,
	searchChords,
	type ChordIndexEntry,
	type ChordSearchResult,
} from "@/lib/chordSearch";
import { parseTabSequence } from "@/lib/chordTabSequence";
import { resolveShapeToChord, type ShapeSearchChord } from "@/lib/chordShapeSearch";
import type { ChordRef } from "@/lib/strumPatterns";
import { chordAbbreviation } from "@/lib/strumProgressions";
import { sameChord } from "@/lib/recentChords";

/** A row of chords offered while the field is empty: one click takes one. */
export interface ChordSuggestionRow {
	label: string;
	chords: readonly ChordRef[];
	/** The one to tint: the chord in effect where the search was opened. */
	current?: ChordRef | null;
}

interface Props {
	chord: ChordRef | null;
	onChange: (chord: ChordRef | null) => void;
	/** Browsable (root, suffix) pairs. Empty while the index is still loading. */
	index: readonly ChordIndexEntry[];
	/**
	 * Chords to match a written shape against — the library plus the player's
	 * own. Null while they are still on their way, or when nothing has been typed
	 * that needs them.
	 */
	shapeCorpus?: readonly ShapeSearchChord[] | null;
	ariaLabel: string;
	/**
	 * A name the bar is holding that the library has no chord for. Shown in red
	 * in place of "No chord", so the bar reads as unfinished rather than blank,
	 * and typing over it is how the player finishes it.
	 */
	unknownLabel?: string | null;
	/**
	 * Offered when the search comes up empty: write the chord down as a shape
	 * of the player's own. Called with what was typed — a name to file the shape
	 * under, or the frets that were being looked for.
	 */
	onCreate?: (query: string) => void;
	/**
	 * Lay the result list out in flow, under the field, instead of floating it.
	 * For a host that scrolls (the fingerpick column popup): a floating list is
	 * clipped by the host's overflow, an in-flow one just makes it scroll.
	 */
	inlineList?: boolean;
	/** How the picked chord is written in the field; the library's display name by default. */
	format?: (root: string, suffix: string) => string;
	/** Rows of chords shown while the field is focused and empty. */
	suggestions?: readonly ChordSuggestionRow[];
	/** A ▶ before every match, which plays it without taking it. */
	onHear?: (chord: ChordRef) => void;
	/** Drawn at the end of every match — its shape, small. */
	renderShape?: (chord: ChordRef) => ReactNode;
}

/**
 * Inline chord picker: a text input that searches the chord library and offers
 * matches in a dropdown. Shares the ranking with the /chords search palette
 * (searchChords), but stays in the flow instead of opening a dialog, so a bar
 * can be assigned without leaving the pattern editor.
 */
export default function ChordSearchSelect({
	chord,
	onChange,
	index,
	shapeCorpus = null,
	ariaLabel,
	unknownLabel = null,
	onCreate,
	inlineList = false,
	format = chordDisplayName,
	suggestions = [],
	onHear,
	renderShape,
}: Props) {
	// A match laid out as a row: its ▶, its name over its kind, its shape.
	const rich = onHear !== undefined || renderShape !== undefined;
	const [query, setQuery] = useState("");
	const [editing, setEditing] = useState(false);
	const [highlighted, setHighlighted] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listboxId = useId();

	/**
	 * A written shape resolves to the chord held that way rather than being
	 * searched for by name: `x32010` is a grip, not a word, and a player copying
	 * a chart has the grip in front of them and not its name.
	 */
	const shape = useMemo(() => (editing ? parseTabSequence(query).frets : null), [editing, query]);
	const shapeChord = useMemo(
		() => (shape && shapeCorpus ? resolveShapeToChord(shapeCorpus, shape) : null),
		[shape, shapeCorpus],
	);
	const results = useMemo(
		() => (editing && !shape ? searchChords(index, query) : []),
		[index, query, editing, shape],
	);
	const typed = query.trim() !== "";
	const offered = !typed ? suggestions.filter((row) => row.chords.length > 0) : [];
	const open = editing && (results.length > 0 || shape !== null || typed || offered.length > 0);
	/**
	 * What the query names, when the library has no chord of that name: "c/d"
	 * finds C/E and C/G, which is not the C/D the player asked for. Offered for
	 * writing down alongside the near misses, not only when there are none.
	 */
	const exact = useMemo(() => (editing && !shape ? normalizeChordName(query) : null), [editing, shape, query]);
	const exactMissing =
		exact !== null && !results.some((r) => r.root === exact.root && r.suffix === exact.suffix);
	const offerCreate =
		onCreate !== undefined &&
		((shape !== null && !shapeChord && shapeCorpus !== null) ||
			(shape === null && typed && index.length > 0 && (results.length === 0 || exactMissing)));

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

	/** A grip is committed to the shape that was written, not to a default one. */
	function commitShape(ref: ChordRef) {
		onChange(ref);
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
		if (shape) {
			// The one row a shape offers, taken the same way a name's would be.
			if (e.key === "Enter" && shapeChord) {
				e.preventDefault();
				e.stopPropagation();
				commitShape(shapeChord);
			}
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

	// Only meaningful while nothing is picked; a named chord retires it.
	const unknown = chord ? null : unknownLabel;
	const displayValue = editing
		? query
		: chord
			? format(chord.root, chord.suffix)
			: (unknown ?? "");

	return (
		<div ref={containerRef} className="csel">
			<div
				data-state={chord && !editing ? "chord" : unknown && !editing ? "unknown" : undefined}
				title={
					unknown && !editing
						? `${unknown} — not in the chord library, so this bar sounds nothing`
						: undefined
				}
				className="csel-field"
			>
				<Search className="csel-icon" aria-hidden />
				<input
					ref={inputRef}
					type="text"
					role="combobox"
					aria-expanded={open}
					aria-controls={listboxId}
					aria-label={ariaLabel}
					autoComplete="off"
					value={displayValue}
					placeholder="Name or frets"
					onFocus={() => setEditing(true)}
					onChange={(e) => {
						setEditing(true);
						setQuery(e.target.value);
						// A new query invalidates the previous highlight — start
						// again from the top match.
						setHighlighted(0);
					}}
					onKeyDown={handleKeyDown}
					className="csel-input"
				/>
				{/* Clearing a kept name goes through the same path a chord does:
				    `setBarChord` retires the placeholder either way. */}
				{(chord || unknown) && !editing && (
					<button
						type="button"
						onClick={() => onChange(null)}
						aria-label={`Clear ${ariaLabel}`}
						title="Clear chord"
						className="csel-clear"
					>
						<X size={14} />
					</button>
				)}
				{/* The field keeps the clear button's room while it is away, so it is
				    one width empty, typed into, or holding a chord. */}
				{!((chord || unknown) && !editing) && <span className="csel-clear" aria-hidden data-away="" />}
			</div>

			{open && (
				<ul
					id={listboxId}
					role="listbox"
					data-inline={inlineList ? "" : undefined}
					className="csel-list"
				>
					{offered.map((row) => (
						<li key={row.label} role="presentation">
							<div className="csel-sec">{row.label}</div>
							<div className="csel-chips">
								{row.chords.map((chord) => (
									<button
										key={`${chord.root} ${chord.suffix}`}
										type="button"
										tabIndex={-1}
										className="csel-chip"
										data-now={row.current && sameChord(row.current, chord) ? "" : undefined}
										onPointerDown={(e) => {
											e.preventDefault();
											commitShape(chord);
										}}
									>
										<MusicalText text={chordAbbreviation(chord)} />
									</button>
								))}
							</div>
						</li>
					))}
					{rich &&
						results.map((r, i) => {
							const ref: ChordRef = { root: r.root, suffix: r.suffix, voicingId: null };
							const name = chordDisplayName(r.root, r.suffix);
							return (
								<li
									key={`${r.root} ${r.suffix}`}
									className="csel-row"
									data-hi={i === highlighted ? "" : undefined}
									onMouseEnter={() => setHighlighted(i)}
								>
									{onHear && (
										<button
											type="button"
											tabIndex={-1}
											className="csel-play"
											aria-label={`Hear ${name}`}
											// Heard, not taken: the field keeps its focus and the list stays open.
											onPointerDown={(e) => {
												e.preventDefault();
												onHear(ref);
											}}
										>
											<Play aria-hidden />
										</button>
									)}
									<button
										type="button"
										role="option"
										aria-selected={i === highlighted}
										onPointerDown={(e) => {
											e.preventDefault();
											commit(r);
										}}
										className="csel-opt"
									>
										<span className="csel-nm">
											<span className="csel-name">
												<MusicalText text={name} />
											</span>
											<span className="csel-cat">{r.category}</span>
										</span>
										{renderShape && (
											<span className="csel-shape" aria-hidden>
												{renderShape(ref)}
											</span>
										)}
									</button>
								</li>
							);
						})}
					{!rich && results.map((r, i) => {
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
									className="csel-opt"
								>
									<span className="csel-name">
										<MusicalText text={chordDisplayName(r.root, r.suffix)} />
									</span>
									<span className="csel-cat">{r.category}</span>
								</button>
							</li>
						);
					})}
					{/* A written shape offers exactly one answer: the chord held that
					    way, pinned to the very voicing that was written. */}
					{rich && shape && shapeChord && (
						<li className="csel-row" data-hi="">
							{onHear && (
								<button
									type="button"
									tabIndex={-1}
									className="csel-play"
									aria-label={`Hear ${chordDisplayName(shapeChord.root, shapeChord.suffix)}`}
									onPointerDown={(e) => {
										e.preventDefault();
										onHear(shapeChord);
									}}
								>
									<Play aria-hidden />
								</button>
							)}
							<button
								type="button"
								role="option"
								aria-selected
								onPointerDown={(e) => {
									e.preventDefault();
									commitShape(shapeChord);
								}}
								className="csel-opt"
							>
								<span className="csel-nm">
									<span className="csel-name">
										<MusicalText text={chordDisplayName(shapeChord.root, shapeChord.suffix)} />
									</span>
									<span className="csel-cat">held this way</span>
								</span>
								{renderShape && (
									<span className="csel-shape" aria-hidden>
										{renderShape(shapeChord)}
									</span>
								)}
							</button>
						</li>
					)}
					{!rich && shape && shapeChord && (
						<li>
							<button
								type="button"
								role="option"
								aria-selected
								onPointerDown={(e) => {
									e.preventDefault();
									commitShape(shapeChord);
								}}
								className="csel-opt"
							>
								<span className="csel-name">
									<MusicalText text={chordDisplayName(shapeChord.root, shapeChord.suffix)} />
								</span>
								<span className="csel-cat">held this way</span>
							</button>
						</li>
					)}

					{shape && !shapeChord && (
						<li className="csel-note">
							{shapeCorpus === null ? "Looking for that shape…" : "Nothing is held that way"}
						</li>
					)}

					{!shape && results.length === 0 && (typed || offered.length === 0) && (
						<li className="csel-note">
							{index.length === 0 ? "Loading chords…" : "No match"}
						</li>
					)}

					{/* The chord asked for is not in the library — by name, by shape, or
					    only its near misses are: it can be written down. */}
					{offerCreate && onCreate && (
						<li>
							<button
								type="button"
								onPointerDown={(e) => {
									e.preventDefault();
									const typed = query.trim();
									onCreate(typed);
									stopEditing();
									inputRef.current?.blur();
								}}
								className="csel-opt csel-create"
							>
								<Plus size={11} className="shrink-0" />
								{exact && exactMissing ? (
									<span>
										Write down <MusicalText text={chordDisplayName(exact.root, exact.suffix)} /> as
										my own chord
									</span>
								) : (
									"Write it down as my own chord"
								)}
							</button>
						</li>
					)}
				</ul>
			)}
		</div>
	);
}
