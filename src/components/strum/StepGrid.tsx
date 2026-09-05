import { useEffect, useRef } from "react";
import { Bar } from "@/lib/strumPatterns";
import {
	paddedBeatCells,
	paddedCellIndex,
	barsFitTwoColumns,
	followScrollTop,
} from "@/lib/strumGridLayout";
import ChordDiagram from "@/components/chords/ChordDiagram";
import type { BarChordDiagram } from "./useBarChordDiagrams";

import { MoveDown, MoveUp, X, Dot, Music } from "lucide-react";

const BEAT_LABELS = {
	1: (beatIdx: number) => [`${beatIdx + 1}`, "", "+", ""],
	2: (beatIdx: number) => [`${beatIdx + 1}`, "", "+", ""],
	3: (_beatIdx: number) => ["tri", "p", "let"],
	4: (beatIdx: number) => [`${beatIdx + 1}`, "e", "+", "a"],
};

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
	chordView = "name",
	barDiagrams,
}: {
	bars: Bar[];
	activeCell: ActiveCell | null;
	size?: "sm" | "md"; // default md
	showLabels?: boolean; // default true
	/** When given, each bar's chord label becomes a button scoped to that bar. */
	onChordClick?: (barIdx: number) => void;
	/** Chord name (default) or fretboard shape above each bar. */
	chordView?: ChordView;
	/** Shapes for the "diagram" view, index-aligned with `bars`. */
	barDiagrams?: (BarChordDiagram | null)[];
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
		D3: () => <MoveDown className={iconCls} />,
		U3: () => <MoveUp className={iconCls} />,
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
				const chordLabel = bar.chord ? `${bar.chord.root} ${bar.chord.suffix}` : null;
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
									onChordClick ? (
										<button
											onClick={() => onChordClick(barIdx)}
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
								) : onChordClick ? (
									<button
										onClick={() => onChordClick(barIdx)}
										className={`flex items-center gap-1.5 border px-2 py-1 text-[11px] font-semibold transition-colors ${
											chordLabel
												? "border-denim bg-denim-tint text-denim hover:bg-denim hover:text-on-denim"
												: "border-line-strong text-ink-dim hover:border-denim hover:bg-denim-tint hover:text-denim"
										}`}
									>
										<Music size={10} />
										<span>{chordLabel ?? "No chord"}</span>
									</button>
								) : (
									chordLabel && (
										<span className="text-[11px] font-semibold text-denim">
											{chordLabel}
										</span>
									)
								)}
							</div>
						)}

						<div className={`flex w-full ${beatGap}`}>
							{bar.beats.map((beat, beatIdx) => {
								const paddedCells = paddedBeatCells(beat);
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
													const label =
														BEAT_LABELS[
															beat.length as keyof typeof BEAT_LABELS
														](beatIdx)[cellIdx];
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
