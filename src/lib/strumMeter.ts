/**
 * Time signatures for strum patterns.
 *
 * The one thing this exists to record: whether a three-cell beat is a compound
 * meter's own subdivision or a triplet squeezed into a simple beat. Nothing in
 * `Bar` distinguishes those today, so `[["D","",""],["D","",""]]` reads equally
 * as two dotted-quarter beats of 6/8 or two triplet beats of 4/4, and no amount
 * of rendering logic can tell them apart without this.
 *
 * A compound meter is counted in dotted beats, not in its bottom number: 6/8 is
 * two beats of three cells, not six beats of one. That is also what lets the
 * existing scheduler play it unchanged — `secondsPerBeat / beat.length` already
 * divides a beat into three even cells.
 */

export type Meter = readonly [number, number];

/** What an absent meter means. Every stored pattern predates this field. */
export const DEFAULT_METER: Meter = [4, 4];

/**
 * Deliberately a short list rather than an open parser. Odd meters (5/4, 7/8)
 * have ambiguous beat grouping and need their own design.
 */
export const SUPPORTED_METERS: readonly Meter[] = [
	[4, 4],
	[3, 4],
	[2, 4],
	[6, 8],
	[12, 8],
];

export function meterLabel(meter: Meter): string {
	return `${meter[0]}/${meter[1]}`;
}

export function metersEqual(a: Meter, b: Meter): boolean {
	return a[0] === b[0] && a[1] === b[1];
}

export function isSupportedMeter(value: unknown): value is Meter {
	if (!Array.isArray(value) || value.length !== 2) return false;
	const [top, bottom] = value;
	if (typeof top !== "number" || typeof bottom !== "number") return false;
	return SUPPORTED_METERS.some((m) => m[0] === top && m[1] === bottom);
}

/** Reading a meter from storage or from outside the app. Never throws. */
export function normalizeMeter(value: unknown): Meter {
	return isSupportedMeter(value) ? [value[0], value[1]] : DEFAULT_METER;
}

/**
 * A compound meter groups its subdivisions in threes under a dotted beat: 6/8,
 * 9/8, 12/8. 3/8 is excluded — with only three subdivisions in the bar it is
 * counted as a simple meter in one.
 */
export function isCompound(meter: Meter): boolean {
	return meter[1] === 8 && meter[0] % 3 === 0 && meter[0] > 3;
}

/** Beats the metronome counts in a bar: dotted beats in a compound meter. */
export function beatsPerBar(meter: Meter): number {
	return isCompound(meter) ? meter[0] / 3 : meter[0];
}

/** How a new bar divides each beat before the player edits it. */
export function naturalCellsPerBeat(meter: Meter): number {
	return isCompound(meter) ? 3 : 2;
}

/** The note the BPM counts. 90 in 6/8 and 90 in 4/4 are not the same pulse. */
export function beatUnitLabel(meter: Meter): string {
	if (isCompound(meter)) return "dotted quarter";
	if (meter[1] === 2) return "half";
	if (meter[1] === 8) return "eighth";
	return "quarter";
}

/**
 * The cell counts a beat may take, in ascending order.
 *
 * Simple and compound meters differ in kind here, not just in default. A quarter
 * beat divides evenly into 2, 3 or 4, so its counts run continuously. A dotted
 * beat divides into three eighths, and each of those halves — so 3 and 6 are the
 * only counts with note values behind them, and 4 or 5 name nothing. The list is
 * therefore a set to step through, never a range to increment.
 *
 * Two divisions are deliberately left out:
 *   * 1 — an undivided beat. Already expressible as three cells struck on the
 *     first, so it would add a shape without adding a rhythm.
 *   * 2 in a compound meter — two dotted eighths, a duplet. It is a 2-against-3
 *     cross-rhythm, the mirror of a triplet in a simple meter, and like a
 *     triplet it has to be *labelled* as one to be readable. Worth adding, but
 *     as its own piece of work rather than hidden in a stepper.
 */
/**
 * Every cell count any meter can legitimately produce, plus 1 for the undivided
 * beats that exist in the shipped presets. The union of `allowedCellsPerBeat`
 * over every supported meter — 5 is absent because no meter divides a beat five
 * ways, so a stored five-cell beat is corruption rather than a quintuplet.
 */
export const VALID_CELL_COUNTS: readonly number[] = [1, 2, 3, 4, 6];

export function allowedCellsPerBeat(meter: Meter): number[] {
	return isCompound(meter) ? [3, 6] : [2, 3, 4];
}

/**
 * How a beat's division reads as a note value: what the player is choosing when
 * they set a whole bar's subdivision. A triplet is the one division that needs
 * naming rather than counting, because three in the space of two is not a
 * fraction of the beat the way the others are.
 */
export function cellCountLabel(meter: Meter, cells: number): string {
	const bottom = meter[1];
	if (isCompound(meter)) {
		if (cells === 3) return `1/${bottom}`;
		if (cells === 6) return `1/${bottom * 2}`;
		return String(cells);
	}
	if (cells === 2) return `1/${bottom * 2}`;
	if (cells === 3) return `1/${bottom * 2}T`;
	if (cells === 4) return `1/${bottom * 4}`;
	return String(cells);
}

/**
 * The next legal cell count in a direction, or null at either end. Stepping
 * through the list rather than adding one is what keeps a compound beat from
 * landing on 4 or 5, which name no note value.
 */
export function stepCellsPerBeat(
	meter: Meter,
	current: number,
	direction: 1 | -1,
): number | null {
	const allowed = allowedCellsPerBeat(meter);
	const i = allowed.indexOf(current);
	// A count off the list (a preset's one-cell beat) steps to the nearest legal
	// neighbour rather than refusing to move.
	if (i === -1) {
		const candidates = direction === 1 ? allowed.filter((c) => c > current) : allowed.filter((c) => c < current);
		if (candidates.length === 0) return null;
		return direction === 1 ? candidates[0] : candidates[candidates.length - 1];
	}
	return allowed[i + direction] ?? null;
}

/**
 * Column headings for one beat, one per *display* column — `paddedBeatCells`
 * widens a one- or two-cell simple beat to four, so the labels follow the grid
 * rather than the cell array.
 *
 * The compound case is the reason this function exists. Its three cells get
 * counted (`1 la li`), never `tri p let`: they are the beat's own division, not
 * three notes in the space of two. "la"/"li" rather than "e"/"+"/"a" because
 * those glyphs already mean fixed fractions of a simple beat, and reusing them
 * at thirds would say something false.
 */
export function beatLabels(meter: Meter, beatIdx: number, cellCount: number): string[] {
	const number = `${beatIdx + 1}`;
	const blanks = (n: number) => Array.from({ length: Math.max(0, n) }, () => "");

	if (isCompound(meter)) {
		if (cellCount === 3) return [number, "la", "li"];
		// Each of the three eighths halved. Same counting system one level down,
		// so the eighths stay where they were and the halves read as inserted.
		if (cellCount === 6) return [number, "ta", "la", "ta", "li", "ta"];
		// An unusual division of a dotted beat: still count the beat, leave the
		// rest unlabelled rather than implying a subdivision that is not there.
		return [number, ...blanks(cellCount - 1)];
	}

	switch (cellCount) {
		case 1:
		case 2:
			return [number, "", "+", ""];
		case 3:
			// Three in the space of two: a triplet, and named as one.
			return ["tri", "p", "let"];
		case 4:
			return [number, "e", "+", "a"];
		default:
			return [number, ...blanks(cellCount - 1)];
	}
}
