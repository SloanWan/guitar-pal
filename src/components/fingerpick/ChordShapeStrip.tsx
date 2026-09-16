"use client";

/**
 * A chord shape laid the way the tab beneath it is: strings as horizontal lines
 * with the 1st (high e) on top, frets running left to right from the nut. A
 * glance-sized companion to a chord symbol on a stave, not a diagram to learn
 * a fingering from — so there are no finger numbers, only where the dots are.
 *
 * Drawn in theme tokens (`--ink`, `--line-strong`, …) so it reads on the
 * workspace in both themes without a backing chip.
 */

/** viewBox width; the height follows from the geometry below. Fret cells are
 * a little narrower than the string spacing, so the strip reads as a fretboard
 * segment rather than a long ruler. */
const VB_W = 78;
/** Room left of the nut for the open (○) and muted (×) marks and the fret number. */
const LEFT = 14;
const FRET_CELLS = 5;
const CELL_W = (VB_W - LEFT - 4) / FRET_CELLS;
const STRING_GAP = 8.6;
// Room above the top string for the window's fret number (shapes up the neck).
const TOP = 9;
const VB_H = TOP * 2 + STRING_GAP * 5;
const DOT_R = 3.3;
/** Height / width of the rendered strip, for callers that must reserve room. */
export const CHORD_STRIP_ASPECT = VB_H / VB_W;
/** How faint a string the player holds but never plucks is drawn. */
const DIMMED_OPACITY = 0.28;

export interface ChordShapeStripProps {
	/** Absolute fret per string, index 0 = low E; -1 = not played, 0 = open. */
	frets: readonly number[];
	/** First fret of the window; 1 draws the nut. */
	startFret: number;
	/** Absolute fret of a barre, if the shape has one. */
	barreFret?: number | null;
	/** Strings to draw faintly, index 0 = low E. */
	dimmedStrings?: readonly boolean[];
	/** Rendered width in px; the height keeps the strip's aspect. */
	width: number;
}

/** y of a string line: index 0 = low E at the bottom, high e on top. */
function stringY(s: number): number {
	return TOP + (5 - s) * STRING_GAP;
}

/** x of the centre of a fret cell, counted from the window's first fret. */
function fretX(visualFret: number): number {
	return LEFT + (visualFret - 0.5) * CELL_W;
}

export default function ChordShapeStrip({
	frets,
	startFret,
	barreFret = null,
	dimmedStrings,
	width,
}: ChordShapeStripProps) {
	const dim = (s: number): number | undefined => (dimmedStrings?.[s] ? DIMMED_OPACITY : undefined);
	const nutX = LEFT;
	const rightX = LEFT + FRET_CELLS * CELL_W;

	// A barre is drawn across the strings fretted at that fret, outermost to
	// outermost — the shape's own dots then sit on top of it.
	const barreStrings = barreFret !== null ? frets.flatMap((f, s) => (f === barreFret ? [s] : [])) : [];
	const barre =
		barreFret !== null && barreStrings.length >= 2
			? { x: fretX(barreFret - startFret + 1), from: Math.min(...barreStrings), to: Math.max(...barreStrings) }
			: null;

	return (
		<svg
			viewBox={`0 0 ${VB_W} ${VB_H}`}
			width={width}
			height={Math.round(width * CHORD_STRIP_ASPECT)}
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			{/* Nut, or — for a shape up the neck — the number of the window's first
			    fret, written over that fret's cell so it labels the cell it means. */}
			{startFret === 1 ? (
				<rect x={nutX - 2} y={stringY(5) - 1} width={2.4} height={STRING_GAP * 5 + 2} fill="var(--ink)" />
			) : (
				<text
					x={fretX(1)}
					y={stringY(5) - 3}
					textAnchor="middle"
					fontSize={6.5}
					fontFamily="ui-monospace, monospace"
					fill="var(--ink-dim)"
				>
					{startFret}
				</text>
			)}

			{/* Fret wires */}
			{Array.from({ length: FRET_CELLS + 1 }, (_, i) => (
				<line
					key={i}
					x1={LEFT + i * CELL_W}
					y1={stringY(5)}
					x2={LEFT + i * CELL_W}
					y2={stringY(0)}
					stroke="var(--line-strong)"
					strokeWidth={i === 0 ? 0 : 0.8}
				/>
			))}

			{/* Strings, high e on top */}
			{frets.map((_, s) => (
				<line
					key={s}
					x1={nutX}
					y1={stringY(s)}
					x2={rightX}
					y2={stringY(s)}
					stroke="var(--ink-dim)"
					strokeWidth={0.9}
					opacity={dim(s)}
				/>
			))}

			{barre && (
				<rect
					x={barre.x - DOT_R}
					y={stringY(barre.to) - DOT_R}
					width={DOT_R * 2}
					height={stringY(barre.from) - stringY(barre.to) + DOT_R * 2}
					rx={DOT_R}
					fill="var(--ink)"
				/>
			)}

			{/* Per-string marks: × / ○ left of the nut, a dot in the fret cell. */}
			{frets.map((fret, s) => {
				const y = stringY(s);
				if (fret === -1) {
					return (
						<text
							key={s}
							x={nutX - 7}
							y={y + 2.6}
							textAnchor="middle"
							fontSize={7.5}
							fontFamily="ui-monospace, monospace"
							fill="var(--ink-faint)"
						>
							×
						</text>
					);
				}
				if (fret === 0) {
					return (
						<circle
							key={s}
							cx={nutX - 7}
							cy={y}
							r={2.4}
							fill="none"
							stroke="var(--ink)"
							strokeWidth={0.9}
							opacity={dim(s)}
						/>
					);
				}
				return (
					<circle
						key={s}
						cx={fretX(fret - startFret + 1)}
						cy={y}
						r={DOT_R}
						fill="var(--ink)"
						opacity={dim(s)}
					/>
				);
			})}
		</svg>
	);
}
