import { isCompound, type Meter } from "@/lib/strumMeter";

/**
 * When the metronome sounds, and how that interleaves with the strum grid.
 *
 * The two are independent: how finely the player drew a beat says nothing about
 * how often they want to hear a click. Before this module the scheduler derived
 * ticks from `beat.length`, which meant a click could only land where a cell
 * happened to exist — so a three-cell beat could not be counted in sixteenths at
 * all, and 4/4 needed a special case that fabricated phantom cells to get four
 * clicks out of a two-cell beat.
 *
 * Here the two grids are computed separately and merged onto their least common
 * multiple, which subsumes that special case rather than extending it.
 */

/**
 * The metronome's three levels. Named for the musical hierarchy rather than for
 * note values, because the note values differ by meter: the beat is a quarter in
 * 4/4 and a dotted quarter in 6/8.
 */
export type TickLevel = "beat" | "division" | "subdivision";

export const TICK_LEVELS: readonly TickLevel[] = ["beat", "division", "subdivision"];

/**
 * Clicks per beat.
 *
 * The whole difference between the meter families lives on one line: a simple
 * beat divides in two, a compound beat in three.
 *
 *   4/4 -> 1, 2, 4 per beat (4, 8, 16 per bar)
 *   6/8 -> 1, 3, 6 per beat (2, 6, 12 per bar)
 */
export function ticksPerBeat(meter: Meter, level: TickLevel): number {
	if (level === "beat") return 1;
	const division = isCompound(meter) ? 3 : 2;
	return level === "division" ? division : division * 2;
}

/**
 * The note value each level counts, written as a fraction of a whole note — the
 * label the player reads. In a simple meter these are the familiar 1/4, 1/8,
 * 1/16; in a compound one the beat is a dotted quarter, which is 3/8.
 *
 * 4/4 renders exactly what it rendered before this module existed.
 */
export function tickLevelLabel(meter: Meter, level: TickLevel): string {
	const bottom = meter[1];
	if (isCompound(meter)) {
		// The beat is three of the bottom note value: 6/8 counts dotted quarters.
		if (level === "beat") return `3/${bottom}`;
		return level === "division" ? `1/${bottom}` : `1/${bottom * 2}`;
	}
	if (level === "beat") return `1/${bottom}`;
	return level === "division" ? `1/${bottom * 2}` : `1/${bottom * 4}`;
}

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
	return (a / gcd(a, b)) * b;
}

/** One position inside a beat, and what happens there. */
export interface BeatStep {
	/** Position within the beat as a fraction of it: 0 <= offset < 1. */
	offset: number;
	/** The grid cell struck here, or null when only the metronome sounds. */
	cellIndex: number | null;
	/** Whether the metronome sounds here. */
	tick: boolean;
}

/**
 * Merge a beat's `cells` strum positions and its `ticks` metronome positions
 * onto one sequence, stepping at the least common multiple of the two.
 *
 * At most twelve steps arise from the counts the app can produce (cells and
 * ticks both come from {1,2,3,4,6}), so the scheduler never walks a long list.
 */
export function beatSteps(cells: number, ticks: number): BeatStep[] {
	const safeCells = Math.max(1, Math.floor(cells));
	const safeTicks = Math.max(1, Math.floor(ticks));
	const steps = lcm(safeCells, safeTicks);
	const perCell = steps / safeCells;
	const perTick = steps / safeTicks;

	return Array.from({ length: steps }, (_, i) => ({
		offset: i / steps,
		cellIndex: i % perCell === 0 ? i / perCell : null,
		tick: i % perTick === 0,
	}));
}
