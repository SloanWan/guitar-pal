import type { Bar, Beat, ChordRef, StepValue } from "@/lib/strumPatterns";
import { MAX_CELLS_PER_BEAT } from "@/lib/strumBars";

/** A beat never drops below two cells; one-cell beats exist only in presets. */
export const MIN_CELLS_PER_BEAT = 2;
/** Beats in a bar added from the editor. */
export const BEATS_PER_NEW_BAR = 4;

const STEP_CYCLE: StepValue[] = ["", "D", "U", "X"];

/** Advance a cell through the editable step values. */
export function cycleStep(current: StepValue): StepValue {
	const idx = STEP_CYCLE.indexOf(current);
	// idx === -1 for D3/U3/DG/UG: (-1+1)%4 = 0 → "" which resets gracefully
	return STEP_CYCLE[(idx + 1) % STEP_CYCLE.length];
}

/** A fresh 4-beat, 2-cell, chordless bar. Always newly allocated — never shared. */
export function emptyBar(): Bar {
	return {
		beats: Array.from({ length: BEATS_PER_NEW_BAR }, () => ["", ""] as Beat),
		chord: null,
	};
}

/** Append a bar. A progression runs as long as the player writes it. */
export function addBar(bars: Bar[]): Bar[] {
	return [...bars, emptyBar()];
}

/** Remove a bar. A pattern always keeps at least one bar. */
export function removeBar(bars: Bar[], barIdx: number): Bar[] {
	if (bars.length <= 1 || barIdx < 0 || barIdx >= bars.length) return bars;
	return bars.filter((_, i) => i !== barIdx);
}

/**
 * Copy a bar, chord and all. The clone lands at the end of the pattern rather
 * than beside its source, so the bar numbering the user is reading never
 * shifts under them.
 */
export function duplicateBar(bars: Bar[], barIdx: number): Bar[] {
	const bar = bars[barIdx];
	if (!bar) return bars;
	return [...bars, { beats: bar.beats.map((beat) => [...beat]), chord: bar.chord }];
}

/** Swap two bars. Out-of-range or identical indices leave the input untouched. */
export function swapBars(bars: Bar[], indexA: number, indexB: number): Bar[] {
	if (
		indexA === indexB ||
		indexA < 0 ||
		indexB < 0 ||
		indexA >= bars.length ||
		indexB >= bars.length
	) {
		return bars;
	}
	const next = [...bars];
	[next[indexA], next[indexB]] = [next[indexB], next[indexA]];
	return next;
}

export function setBarChord(bars: Bar[], barIdx: number, chord: ChordRef | null): Bar[] {
	return bars.map((bar, i) => (i === barIdx ? { ...bar, chord } : bar));
}

function mapBeat(
	bars: Bar[],
	barIdx: number,
	beatIdx: number,
	fn: (beat: Beat) => Beat,
): Bar[] {
	return bars.map((bar, bi) =>
		bi !== barIdx
			? bar
			: { ...bar, beats: bar.beats.map((beat, i) => (i === beatIdx ? fn(beat) : beat)) },
	);
}

export function cycleCell(
	bars: Bar[],
	barIdx: number,
	beatIdx: number,
	cellIdx: number,
): Bar[] {
	return mapBeat(bars, barIdx, beatIdx, (beat) =>
		beat.map((cell, ci) => (ci === cellIdx ? cycleStep(cell) : cell)),
	);
}

export function addCell(bars: Bar[], barIdx: number, beatIdx: number): Bar[] {
	return mapBeat(bars, barIdx, beatIdx, (beat) =>
		beat.length < MAX_CELLS_PER_BEAT ? [...beat, ""] : beat,
	);
}

export function removeCell(bars: Bar[], barIdx: number, beatIdx: number): Bar[] {
	return mapBeat(bars, barIdx, beatIdx, (beat) =>
		beat.length > MIN_CELLS_PER_BEAT ? beat.slice(0, -1) : beat,
	);
}

/**
 * The scheduler reports a beat index into the flattened bar sequence; the grid
 * draws bar by bar. Convert one to the other. Out-of-range input clamps to 0 so
 * a stale cursor can never highlight a cell that is not there.
 */
export function barLocalBeatIndex(bars: Bar[], flatBeatIdx: number): number {
	if (flatBeatIdx < 0) return 0;
	let remaining = flatBeatIdx;
	for (const bar of bars) {
		if (remaining < bar.beats.length) return remaining;
		remaining -= bar.beats.length;
	}
	return 0;
}
