import { useEffect, useRef } from "react";
import { Bar } from "@/lib/strumPatterns";
import { barPlaceholder } from "@/lib/strumBars";
import { chordDisplayName } from "@/lib/chordSuffixes";
import {
	ghostedBeats,
	paddedBeatCells,
	paddedCellIndex,
	barsFitTwoColumns,
	followScrollTop,
} from "@/lib/strumGridLayout";
import { DEFAULT_METER, beatLabels, type Meter } from "@/lib/strumMeter";
import ChordDiagram from "@/components/chords/ChordDiagram";
import type { BarChordDiagram } from "./useBarChordDiagrams";

import { MoveDown, MoveUp, X, Dot, Music, Pencil } from "lucide-react";

/** Nearest ancestor that actually scrolls vertically, if any. */
function scrollableAncestor(el: HTMLElement): HTMLElement | null {
	for (let node = el.parentElement; node; node = node.parentElement) {
		const overflowY = getComputedStyle(node).overflowY;
		if (
			(overflowY === "auto" || overflowY === "scroll") &&
			node.scrollHeight > node.clientHeight
		)
			return node;
	}
	return null;
}

export interface ActiveCell {
	barIdx: number;
	/** Beat index within its bar, not into the flattened sequence. */
	beatIdx: number;
	cellIdx: number;
}

/** How a bar announces its chord: written out, or drawn on a fretboard. */
export type ChordView = "name" | "diagram";

/**
 * Stands in while a bar's shape is being fetched. Same box as the compact
 * `ChordDiagram` — 100 x 86 grid plus its label — so the real diagram drops
 * into place without moving the bar underneath it.
 */
function ChordDiagramSkeleton({ label }: { label: string }) {
	return (
		<div
			className="flex animate-pulse flex-col items-center gap-1 border border-transparent bg-denim-tint p-3"
			aria-label={`Loading the ${label} diagram`}
			role="status"
		>
			<div className="h-[86px] w-[100px] bg-line" />
			<span className="text-xs font-medium text-denim">{label}</span>
		</div>
	);
}

export default function StepGrid({
	bars,
	activeCell,
	size = "md",
	showLabels = true,
	onChordClick,
	onPlaceholderClick,
	chordView = "name",
	barDiagrams,
	onEditChordShape,
	meter = DEFAULT_METER,
}: {
	bars: Bar[];
	activeCell: ActiveCell | null;
	size?: "sm" | "md"; // default md
	showLabels?: boolean; // default true
	/** When given, each bar's chord label becomes a button scoped to that bar. */
	onChordClick?: (barIdx: number) => void;
	/**
	 * When given, only the bars kept as a name the library has nothing for become
	 * buttons. Lets a sequence be finished where it is read, without making every
	 * settled chord in it clickable as well.
	 */
	onPlaceholderClick?: (barIdx: number) => void;
	/** Chord name (default) or fretboard shape above each bar. */
	chordView?: ChordView;
	/** Shapes for the "diagram" view, index-aligned with `bars`. */
	barDiagrams?: (BarChordDiagram | null)[];
	/**
	 * Given, each drawn shape gains an edit control. Offered only in the diagram
	 * view: it is the one place the player is already looking at the shape rather
	 * than at the chord's name.
	 */
	onEditChordShape?: (barIdx: number) => void;
	/**
	 * The pattern's time signature. Decides whether a three-cell beat is counted
	 * as a compound beat's own division or called a triplet — the cells look
	 * identical, so nothing else can tell. Defaults to 4/4, which is how every
	 * pattern read before meters existed.
	 */
	meter?: Meter;
}) {
	const isSm = size === "sm";
	const isMultiBar = bars.length > 1;
	// Two bars share a row only while both stay narrow enough; a fine-grained bar
	// takes the whole row rather than squeezing its cells under the arrow size.
	const twoColumns = !isSm && barsFitTwoColumns(bars);

	// The bar currently playing, scrolled into view so a tall stack follows the
	// cursor instead of leaving the player looking at bar 1. A multi-bar
	// progression glides: the playing bar holds the middle of its scroller and
	// the row after it stays on screen, so the next chord is readable ahead of
	// time. A lone bar keeps the cheap "only scroll if it is off screen" nudge.
	const barRefs = useRef<(HTMLDivElement | null)[]>([]);
	const activeBarIdx = activeCell?.barIdx ?? null;
	useEffect(() => {
		if (activeBarIdx === null) return;
		const active = barRefs.current[activeBarIdx];
		if (!active) return;

		const scroller = isMultiBar ? scrollableAncestor(active) : null;
		if (!scroller) {
			active.scrollIntoView({ block: "nearest" });
			return;
		}

		const scrollerTop = scroller.getBoundingClientRect().top - scroller.scrollTop;
		const activeRect = active.getBoundingClientRect();
		// The row below, not merely the next bar: under the two-per-row layout the
		// following bar can sit beside this one, and that row is already in view.
		let nextRowBottom: number | null = null;
		for (let i = activeBarIdx + 1; i < barRefs.current.length; i++) {
			const rect = barRefs.current[i]?.getBoundingClientRect();
			if (rect && rect.top > activeRect.top + 1) {
				nextRowBottom = rect.bottom - scrollerTop;
				break;
			}
		}
		const target = followScrollTop({
			activeTop: activeRect.top - scrollerTop,
			activeHeight: activeRect.height,
			nextBottom: nextRowBottom,
			viewportHeight: scroller.clientHeight,
			contentHeight: scroller.scrollHeight,
		});
		if (Math.abs(target - scroller.scrollTop) < 1) return;

		const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		scroller.scrollTo({ top: target, behavior: reduceMotion ? "auto" : "smooth" });
	}, [activeBarIdx, isMultiBar]);

	// The arrow shrinks with the cell so a sixteenth-note bar still fits a phone
	// screen whole, rather than overflowing or overlapping.
	const iconCls = isSm ? "size-3" : "size-3.5 sm:size-4 md:size-5";
	// Mirrors CELL_MIN_WIDTHS_PX in strumGridLayout — change both together.
	const cellMinWidth = isSm ? "" : "min-w-3.5 sm:min-w-5 md:min-w-6";
	const beatPy = isSm ? "py-1" : "py-2";
	const beatGap = isSm ? "gap-1" : "gap-2";
	const labelFontSize = isSm ? "text-[8px]" : "text-[12px]";
	// The chord row is the interaction surface on the playing card; the small
	// library preview stays a bare grid.
	const showChordRow = !isSm;

	const CELL_ARROW_MAP = {
		D: () => <MoveDown className={iconCls} />,
		U: () => <MoveUp className={iconCls} />,
		X: () => <X className={iconCls} />,
		G: () => <></>,
		DG: () => <MoveDown className={iconCls} color="var(--ink-faint)" />,
		UG: () => <MoveUp className={iconCls} color="var(--ink-faint)" />,
		"": () => <Dot className={iconCls} />,
	};

	return (
		// One bar per row; two per row from md upwards only while the bars are
		// narrow enough for both to keep full-size cells (see barsFitTwoColumns).
		<div
			className={`grid w-full grid-cols-1 ${isSm ? "gap-2" : "gap-x-6 gap-y-4"} ${
				twoColumns ? "md:grid-cols-2" : ""
			}`}
		>
			{bars.map((bar, barIdx) => {
				const isActiveBar = activeCell?.barIdx === barIdx;
				// The travelling hand, drawn from the struck cells rather than stored
				// beside them. Cell for cell with `bar.beats`, so the active-cell
				// index and the padding below still line up.
				const displayBeats = ghostedBeats(bar.beats);
				// Written, not concatenated: a chord nobody has named is stored under a
				// placeholder root, and "? unknown" is not something to make a player
				// read off their own chart.
				const chordLabel = bar.chord
					? chordDisplayName(bar.chord.root, bar.chord.suffix)
					: null;
				// A chord the library has nothing for, kept as the player typed it.
				// It reads red and draws no shape — there is no shape to draw — and
				// the bar it names sounds nothing until a chord is picked for it.
				const placeholder = barPlaceholder(bar);
				const placeholderTitle = !placeholder
					? undefined
					: onPlaceholderClick
						? `${placeholder} — not in the chord library, so this bar sounds nothing. Write its shape to file it as a chord.`
						: `${placeholder} — not in the chord library, so this bar sounds nothing`;
				// The two are different questions and go to different places: a chord
				// the library has is changed by picking another one, while a bar kept
				// as a name has no shape on record and is finished by drawing one.
				const chordClick = placeholder ? onPlaceholderClick : onChordClick;
				// The shape only replaces the name once it has actually arrived; until
				// then — and for a bar with no chord — the name stands in.
				const diagram = chordView === "diagram" ? (barDiagrams?.[barIdx] ?? null) : null;
				return (
					<div
						key={barIdx}
						ref={(el) => {
							barRefs.current[barIdx] = el;
						}}
						// The bar line: a hairline down the left edge of every bar.
						className={`flex flex-col gap-1.5 ${
							isMultiBar ? "border-l border-line-strong pl-2" : ""
						}`}
					>
						{showChordRow && (
							<div className="flex items-center gap-2">
								{isMultiBar && (
									<span className="font-mono text-[9px] tracking-[0.2em] text-ink-faint">
										{barIdx + 1}
									</span>
								)}
								{diagram && chordLabel ? (
									chordClick ? (
										<button
											onClick={() => chordClick(barIdx)}
											title={`${chordLabel} — change this bar's chord`}
											className="border border-transparent transition-colors hover:border-denim"
										>
											{diagram.status === "ready" ? (
												<ChordDiagram
													def={diagram.def}
													label={chordLabel}
													size="compact"
												/>
											) : (
												<ChordDiagramSkeleton label={chordLabel} />
											)}
										</button>
									) : diagram.status === "ready" ? (
										<ChordDiagram def={diagram.def} label={chordLabel} size="compact" />
									) : (
										<ChordDiagramSkeleton label={chordLabel} />
									)
								) : chordClick ? (
									<button
										onClick={() => chordClick(barIdx)}
										title={placeholderTitle ?? (chordLabel ? undefined : "Pick this bar's chord")}
										className={`flex items-center gap-1.5 border px-2 py-1 text-[11px] font-semibold transition-colors ${
											chordLabel
												? "border-denim bg-denim-tint text-denim hover:bg-denim hover:text-on-denim"
												: placeholder
													? "border-destructive bg-destructive-tint text-destructive hover:bg-destructive hover:text-white"
													: "border-line-strong text-ink-dim hover:border-denim hover:bg-denim-tint hover:text-denim"
										}`}
									>
										<Music size={10} />
										<span>{chordLabel ?? placeholder ?? "No chord"}</span>
									</button>
								) : (
									(chordLabel || placeholder) && (
										<span
											title={placeholderTitle}
											className={`text-[11px] font-semibold ${
												chordLabel ? "text-denim" : "text-destructive"
											}`}
										>
											{chordLabel ?? placeholder}
										</span>
									)
								)}
								{/* The diagram view's way into the shape editor. A bar kept as
								    a name has no diagram to hang a pencil off, but it is the one
								    that most needs a shape written for it. */}
								{onPlaceholderClick && placeholder && chordView === "diagram" && (
									<button
										type="button"
										onClick={() => onPlaceholderClick(barIdx)}
										aria-label={`Write the shape for ${placeholder}`}
										title="Write this chord's shape"
										className="flex items-center justify-center p-1 text-destructive transition-colors hover:text-denim-accent"
									>
										<Pencil size={11} />
									</button>
								)}
								{onEditChordShape && diagram && chordLabel && (
									<button
										type="button"
										onClick={() => onEditChordShape(barIdx)}
										aria-label={`Edit the shape for ${chordLabel}`}
										title="Edit this chord's shape"
										className="flex items-center justify-center p-1 text-ink-faint transition-colors hover:text-denim-accent"
									>
										<Pencil size={11} />
									</button>
								)}
							</div>
						)}

						<div className={`flex w-full ${beatGap}`}>
							{bar.beats.map((beat, beatIdx) => {
								const paddedCells = paddedBeatCells(displayBeats[beatIdx]);
								const isActiveBeat = isActiveBar && activeCell?.beatIdx === beatIdx;
								return (
									<div className="flex flex-col gap-2 flex-1" key={beatIdx}>
										<div
											className={`flex border ${beatPy} transition-colors duration-100 ${
												isActiveBeat
													? "border-denim/50 bg-denim-tint"
													: "border-line"
											}`}
										>
											{paddedCells.map((cell, cellIdx) => {
												const Icon =
													CELL_ARROW_MAP[cell as keyof typeof CELL_ARROW_MAP];
												const isActiveCell =
													isActiveBeat &&
													cellIdx ===
														paddedCellIndex(beat.length, activeCell!.cellIdx);
												return (
													<div
														key={cellIdx}
														className={`flex flex-1 items-center justify-center transition-colors duration-100 ${
															cellMinWidth
														} ${isActiveCell ? "text-denim" : ""}`}
													>
														<Icon />
													</div>
												);
											})}
										</div>
										{showLabels && (
											<div className="flex">
												{paddedCells.map((_, cellIdx) => {
													// Labels are indexed by display column; a beat
													// labelled shorter than its padded width leaves
													// the remaining columns blank.
													const label =
														beatLabels(meter, beatIdx, beat.length)[cellIdx] ?? "";
													return (
														<div
															className={`flex flex-1 justify-center ${
																cellMinWidth
															} ${labelFontSize} text-ink-dim`}
															key={cellIdx}
														>
															{label}
														</div>
													);
												})}
											</div>
										)}
									</div>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
}
