"use client";

/**
 * A horizontal guitar neck that lights up whatever `FretMark[]` it is handed.
 *
 * It knows nothing about scales or chords: every consumer (scale viewer, chord
 * overlay, CAGED, improvisation) is a pure function producing marks, and this
 * is the one board they all draw on. Check the imports: only the mark model.
 *
 * Rendering model: the marks are an LED matrix. Every string/fret slot on the
 * neck is always in the DOM as a dormant node; a mark switches its slot on.
 * Changing root, scale or chord therefore never mounts or unmounts anything —
 * the dots cross-fade in CSS.
 *
 * Sizing: the board scales so that `VISIBLE_FRETS` cells fill the container,
 * the size a full-width 15-fret board had, and the rest of the 22-fret neck
 * scrolls sideways under the fixed string-name column. The scale comes from
 * container-query units in CSS, so no measuring in JS; a floor keeps a phone
 * from shrinking the cells, it scrolls further instead. Geometry is uniform
 * per fret rather than the real 2^(1/12) taper so every position reads the same.
 */
import { useEffect, useRef } from "react";

import { STRING_LABELS } from "@/lib/chordVoicingToMidi";
import {
	STRING_COUNT,
	slotKey,
	type FretMark,
	type FretboardProps,
	type MarkEmphasis,
} from "@/lib/fretboard/types";

// ── Geometry (SVG user units = CSS px) ──────────────────────────────────────
// Cell k (the space behind fret wire k) spans x = [k·FRET_W, (k+1)·FRET_W]; the
// open-string cell is k = 0, so the nut is the right edge of cell 0 and fret
// wire k is the right edge of cell k. Strings sit at y = TOP + (5 − s)·GAP,
// low E at the bottom the way TAB and every scale chart draw it.
export const FRET_W = 44;
const LABEL_W = 24;
const TOP = 16;
const STRING_GAP = 22;
const DOT_R = 8;
const RING_R = 11;
const INLAY = 5;
const NUMBERS_Y = TOP + (STRING_COUNT - 1) * STRING_GAP + 22;
const H = NUMBERS_Y + 8;
/** Keeps the boundary fret wires from being half-clipped at the neck's edges. */
const EDGE = 1;
/** How many cells fill the container width: the open cell plus 15 frets. */
const VISIBLE_FRETS = 16;
/** Smallest scale a narrow container may reach; below it the neck scrolls. */
const MIN_SCALE = 1.25;
/** Design width that `VISIBLE_FRETS` occupies, labels included. */
const DESIGN_W = LABEL_W + VISIBLE_FRETS * FRET_W + EDGE * 2;

/**
 * A length in CSS: `units` design units at the container's scale, never below
 * the floor. `100cqw` is the width of the nearest query container, the outer
 * wrapper, so `100cqw / DESIGN_W` is the scale factor.
 */
function scaled(units: number): string {
	return `max(calc(100cqw * ${(units / DESIGN_W).toFixed(5)}), ${(units * MIN_SCALE).toFixed(2)}px)`;
}

const SINGLE_INLAYS: readonly number[] = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_INLAYS: readonly number[] = [12, 24];

/** Thicker toward the low E, the way the strings actually are. */
const STRING_STROKE: readonly number[] = [2, 1.7, 1.4, 1.1, 0.9, 0.75];

function cellCenterX(fret: number): number {
	return fret * FRET_W + FRET_W / 2;
}

function wireX(fret: number): number {
	return (fret + 1) * FRET_W;
}

function stringY(string: number): number {
	return TOP + (STRING_COUNT - 1 - string) * STRING_GAP;
}

function betweenStringsY(lower: number): number {
	return (stringY(lower) + stringY(lower + 1)) / 2;
}

export interface FretboardComponentProps extends FretboardProps {
	className?: string;
	/** Accessible name for the board; defaults to a plain description. */
	label?: string;
	/**
	 * A fret to bring into view, scrolled smoothly (instantly under reduced
	 * motion). Re-applied whenever the value changes, so pass a fresh object
	 * to re-scroll to the same fret.
	 */
	scrollTo?: { fret: number } | null;
}

type SlotEmphasis = MarkEmphasis | "none";

export default function Fretboard({
	marks,
	fromFret,
	toFret,
	className,
	label = "Guitar fretboard",
	scrollTo = null,
}: FretboardComponentProps) {
	const scroller = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = scroller.current;
		if (!el || !scrollTo) return;
		const reduce = window.matchMedia?.(
			"(prefers-reduced-motion: reduce)",
		).matches;
		// The neck is scaled by CSS, so measure the rendered width for the ratio.
		const svg = el.firstElementChild as SVGSVGElement | null;
		const scale = svg
			? svg.getBoundingClientRect().width / Number(svg.getAttribute("width"))
			: 1;
		// Leave one cell of context to the left of the target fret.
		const left = Math.max(0, (scrollTo.fret - fromFret - 1) * FRET_W * scale);
		el.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
	}, [scrollTo, fromFret]);

	const byKey = new Map<string, FretMark>();
	for (const mark of marks) byKey.set(slotKey(mark.string, mark.fret), mark);

	const cells = toFret - fromFret + 1;
	const neckW = cells * FRET_W + EDGE * 2;
	const frets = Array.from({ length: cells }, (_, i) => fromFret + i);
	const strings = Array.from({ length: STRING_COUNT }, (_, string) => string);

	return (
		<div
			className={className}
			style={{ containerType: "inline-size" }}
			role="img"
			aria-label={label}
		>
			<div className="flex">
				{/* String names: a fixed column, outside the scroller. */}
				<svg
					viewBox={`0 0 ${LABEL_W} ${H}`}
					width={LABEL_W}
					height={H}
					className="shrink-0"
					style={{ width: scaled(LABEL_W), height: scaled(H) }}
					aria-hidden="true"
				>
					{strings.map((string) => (
						<text
							key={string}
							x={LABEL_W - 8}
							y={stringY(string) + 3}
							textAnchor="end"
							fontSize={9}
							className="fill-ink-faint font-mono"
						>
							{STRING_LABELS[string]}
						</text>
					))}
				</svg>

				<div
					ref={scroller}
					className="fp-thin-scroll min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
				>
					<svg
						viewBox={`0 0 ${neckW} ${H}`}
						width={neckW}
						height={H}
						className="block max-w-none"
						style={{ width: scaled(neckW), height: scaled(H) }}
						data-from-fret={fromFret}
						data-to-fret={toFret}
					>
						<g
							className="fb-neck"
							style={{ transform: `translateX(${EDGE - fromFret * FRET_W}px)` }}
						>
							{/* Inlays: squares, so they are not mistaken for marks. */}
							{frets.map((fret) => {
								if (SINGLE_INLAYS.includes(fret)) {
									return (
										<rect
											key={`inlay-${fret}`}
											x={cellCenterX(fret) - INLAY / 2}
											y={betweenStringsY(2) - INLAY / 2}
											width={INLAY}
											height={INLAY}
											className="fill-ink-faint"
											opacity={0.6}
										/>
									);
								}
								if (DOUBLE_INLAYS.includes(fret)) {
									return (
										<g
											key={`inlay-${fret}`}
											className="fill-ink-faint"
											opacity={0.6}
										>
											<rect
												x={cellCenterX(fret) - INLAY / 2}
												y={betweenStringsY(1) - INLAY / 2}
												width={INLAY}
												height={INLAY}
											/>
											<rect
												x={cellCenterX(fret) - INLAY / 2}
												y={betweenStringsY(3) - INLAY / 2}
												width={INLAY}
												height={INLAY}
											/>
										</g>
									);
								}
								return null;
							})}

							{/* Fret wires, then the nut over them when the open cell is shown. */}
							{frets
								.filter((fret) => fret >= 1)
								.map((fret) => (
									<line
										key={`wire-${fret}`}
										x1={wireX(fret)}
										x2={wireX(fret)}
										y1={stringY(STRING_COUNT - 1) - 6}
										y2={stringY(0) + 6}
										strokeWidth={1}
										shapeRendering="crispEdges"
										className="stroke-line-strong"
									/>
								))}
							{fromFret === 0 && (
								<line
									x1={wireX(0)}
									x2={wireX(0)}
									y1={stringY(STRING_COUNT - 1) - 6}
									y2={stringY(0) + 6}
									strokeWidth={3}
									shapeRendering="crispEdges"
									className="stroke-ink"
								/>
							)}

							{/* Strings: gauge thickens toward the low E. */}
							{strings.map((string) => (
								<line
									key={`string-${string}`}
									x1={fromFret * FRET_W}
									x2={wireX(toFret)}
									y1={stringY(string)}
									y2={stringY(string)}
									strokeWidth={STRING_STROKE[string]}
									className="stroke-line-strong"
								/>
							))}

							{/* Fret numbers under each cell. */}
							{frets.map((fret) => (
								<text
									key={`num-${fret}`}
									x={cellCenterX(fret)}
									y={NUMBERS_Y}
									textAnchor="middle"
									fontSize={9}
									className="fill-ink-faint font-mono"
								>
									{fret}
								</text>
							))}

							{/* The LED matrix: one slot per string and fret, lit by a mark. */}
							{strings.map((string) =>
								frets.map((fret) => {
									const mark = byKey.get(slotKey(string, fret));
									const emphasis: SlotEmphasis = mark?.emphasis ?? "none";
									const cx = cellCenterX(fret);
									const cy = stringY(string);
									return (
										<g
											key={slotKey(string, fret)}
											className="fb-mark"
											data-string={string}
											data-fret={fret}
											data-emphasis={emphasis}
											data-tone={mark?.tone}
										>
											<circle className="fb-ring" cx={cx} cy={cy} r={RING_R} />
											<circle
												className="fb-dot"
												cx={cx}
												cy={cy}
												r={DOT_R}
												strokeWidth={1.25}
											/>
											<text
												className="fb-label font-mono"
												x={cx}
												y={cy + 3}
												textAnchor="middle"
												fontSize={8}
											>
												{mark?.label ?? ""}
											</text>
										</g>
									);
								}),
							)}
						</g>
					</svg>
				</div>
			</div>
		</div>
	);
}
