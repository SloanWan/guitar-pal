import type { Bar, Beat, StepValue } from "@/lib/strumPatterns";

/**
 * Cells a beat occupies on screen. One- and two-cell beats are padded out to
 * four so a quarter, an eighth and a sixteenth beat all take the same width;
 * triplets keep their three.
 */
export function paddedBeatLength(beatLength: number): number {
	return beatLength === 1 || beatLength === 2 ? 4 : beatLength;
}

/**
 * A rendered column: a real step, or `"G"` — the pure padding cell the grid
 * draws blank. `"G"` never reaches the audio engine.
 */
export type DisplayCell = StepValue | "G";

/** A beat with its ghost padding filled in — what the grid actually renders. */
export function paddedBeatCells(beat: Beat): DisplayCell[] {
	if (beat.length === 1) return [beat[0], "G", "UG", "G"];
	if (beat.length === 2) return [beat[0], "G", beat[1], "G"];
	return beat;
}

/** Maps an audio-engine cell index onto its padded display column. */
export function paddedCellIndex(beatLength: number, cellIdx: number): number {
	return beatLength === 2 ? cellIdx * 2 : cellIdx;
}

/** Columns a whole bar takes on screen — its width, in cells. */
export function barDisplayCells(bar: Bar): number {
	return bar.beats.reduce((total, beat) => total + paddedBeatLength(beat.length), 0);
}

export function maxBarDisplayCells(bars: Bar[]): number {
	return bars.reduce((max, bar) => Math.max(max, barDisplayCells(bar)), 0);
}

/**
 * A cell never shrinks below this, so the stroke arrows stay legible as the
 * subdivision gets finer. The width steps up with the viewport — a sixteenth
 * bar (16 cells) has to fit a phone screen whole, so the phone step is small
 * enough that 16 × 14px plus the beat gaps stays under 360px. Mirrors
 * `min-w-3.5 sm:min-w-5 md:min-w-6` in StepGrid — change both together.
 */
export const CELL_MIN_WIDTHS_PX = { base: 14, sm: 20, md: 24 } as const;
/** The desktop width, which the two-column threshold below is derived from. */
export const CELL_MIN_WIDTH_PX = CELL_MIN_WIDTHS_PX.md;

/**
 * The widest a bar can get: four beats of sixteenths.
 * 16 × 24px + the three 8px gaps between beats ≈ 408px, so one bar always fits
 * the 640px card, while two never do.
 */
export const MAX_BAR_DISPLAY_CELLS = 16;

/**
 * Cell count at which a bar still leaves room for a second one beside it: half
 * the card holds eight cells at the minimum width. Because beats pad out to
 * four columns, an ordinary four-beat bar is 12–16 columns wide and therefore
 * takes a row of its own; only shorter bars pair up.
 */
export const TWO_COLUMN_MAX_CELLS = 8;

/**
 * Whether the grid may lay bars out two per row. A single fine-grained bar is
 * enough to force one per row — mixed widths in a row would overlap or overflow.
 */
export function barsFitTwoColumns(bars: Bar[]): boolean {
	return bars.length > 1 && maxBarDisplayCells(bars) <= TWO_COLUMN_MAX_CELLS;
}

/**
 * Breathing room kept between the row after the playing one and the bottom of
 * the viewport, so the upcoming chord never sits flush against the edge.
 */
export const FOLLOW_SCROLL_PADDING_PX = 8;

export interface FollowScrollInput {
	/** Top of the playing bar, in the scroll container's content coordinates. */
	activeTop: number;
	activeHeight: number;
	/** Bottom of the bar after it, or null when the playing bar is the last. */
	nextBottom: number | null;
	/** Visible height of the scroll container. */
	viewportHeight: number;
	/** Full scrollable height of its content. */
	contentHeight: number;
}

/**
 * Where the bar list should sit while a bar plays: the playing row centred,
 * then scrolled down just far enough to keep the row after it on screen — the
 * player has to read the next chord before reaching it. The correction never
 * pushes the playing row past the top edge, and the result stays inside the
 * container's scroll range.
 */
export function followScrollTop({
	activeTop,
	activeHeight,
	nextBottom,
	viewportHeight,
	contentHeight,
}: FollowScrollInput): number {
	let target = activeTop + activeHeight / 2 - viewportHeight / 2;
	if (nextBottom !== null) {
		const revealNext = nextBottom + FOLLOW_SCROLL_PADDING_PX - viewportHeight;
		target = Math.max(target, revealNext);
		target = Math.min(target, activeTop - FOLLOW_SCROLL_PADDING_PX);
	}
	const maxScroll = Math.max(contentHeight - viewportHeight, 0);
	return Math.min(Math.max(target, 0), maxScroll);
}
