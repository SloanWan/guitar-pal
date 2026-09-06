import type { Bar, Beat, ChordRef, StepValue } from "@/lib/strumPatterns";
import {
	DEFAULT_METER,
	beatsPerBar,
	naturalCellsPerBeat,
	stepCellsPerBeat,
	type Meter,
} from "@/lib/strumMeter";

/**
 * The coarsest division the editor offers in a simple meter; one-cell beats
 * exist only in presets. A compound meter has its own floor of three — see
 * `allowedCellsPerBeat`, which is the authority for both.
 */
export const MIN_CELLS_PER_BEAT = 2;

const STEP_CYCLE: StepValue[] = ["", "D", "U", "X"];

/** Advance a cell through the editable step values. */
export function cycleStep(current: StepValue): StepValue {
	const idx = STEP_CYCLE.indexOf(current);
	// idx === -1 for D3/U3/DG/UG: (-1+1)%4 = 0 → "" which resets gracefully
	return STEP_CYCLE[(idx + 1) % STEP_CYCLE.length];
}

/**
 * A fresh chordless bar shaped by its meter: four two-cell beats in 4/4, two
 * three-cell beats in 6/8. Always newly allocated — never shared.
 */
export function emptyBar(meter: Meter = DEFAULT_METER): Bar {
	const cells = naturalCellsPerBeat(meter);
	return {
		beats: Array.from(
			{ length: beatsPerBar(meter) },
			() => Array.from({ length: cells }, () => "") as Beat,
		),
		chord: null,
	};
}

/** Append a bar. A progression runs as long as the player writes it. */
export function addBar(bars: Bar[], meter: Meter = DEFAULT_METER): Bar[] {
	return [...bars, emptyBar(meter)];
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

/**
 * Re-divide a beat, keeping every stroke at the point in time it was written.
 *
 * Doubling is not appending. Three eighths becoming six sixteenths must leave
 * each eighth on its own position with the new off-beats empty between them;
 * appending blanks would shove all three strokes into the first half of the
 * beat and silently rewrite the rhythm. Halving keeps the on-beat cells and
 * drops whatever sat between them.
 */
export function resizeBeat(beat: Beat, next: number): Beat {
	if (next < 1 || next === beat.length || beat.length === 0) return beat;
	const blanks = () => Array.from({ length: next }, () => "" as StepValue);

	if (next % beat.length === 0) {
		const stride = next / beat.length;
		const out = blanks();
		beat.forEach((cell, i) => {
			out[i * stride] = cell;
		});
		return out;
	}

	if (beat.length % next === 0) {
		const stride = beat.length / next;
		return Array.from({ length: next }, (_, i) => beat[i * stride]);
	}

	// No even mapping (2 -> 3, 3 -> 4): nothing lines up, so keep the leading
	// cells and pad or trim, which is what the stepper did before meters existed.
	const out = blanks();
	for (let i = 0; i < Math.min(next, beat.length); i++) out[i] = beat[i];
	return out;
}

/**
 * Step a beat to the next finer division its meter allows. A no-op at the
 * finest one — the legal counts are a set, not a range, so a compound beat goes
 * 3 -> 6 and never stops at 4.
 */
export function addCell(
	bars: Bar[],
	barIdx: number,
	beatIdx: number,
	meter: Meter = DEFAULT_METER,
): Bar[] {
	return mapBeat(bars, barIdx, beatIdx, (beat) => {
		const next = stepCellsPerBeat(meter, beat.length, 1);
		return next === null ? beat : resizeBeat(beat, next);
	});
}

/** Step a beat to the next coarser division its meter allows. */
export function removeCell(
	bars: Bar[],
	barIdx: number,
	beatIdx: number,
	meter: Meter = DEFAULT_METER,
): Bar[] {
	return mapBeat(bars, barIdx, beatIdx, (beat) => {
		const next = stepCellsPerBeat(meter, beat.length, -1);
		return next === null ? beat : resizeBeat(beat, next);
	});
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
