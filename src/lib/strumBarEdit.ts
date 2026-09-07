import type { Bar, Beat, ChordRef, StepValue } from "@/lib/strumPatterns";
import { barPlaceholder } from "@/lib/strumBars";
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

/**
 * Advance a cell through the editable step values, starting from the stroke
 * that belongs at this position.
 *
 * `prefer` is the direction the hand is already travelling in that slot — down
 * on an even cell, up on an odd one. Leading with it makes the common case one
 * click instead of two on every off-beat, and costs nothing on the on-beats,
 * which already led with a downstroke. Nothing becomes unreachable: the
 * against-the-motion stroke is simply second in the cycle, and the shipped
 * "muted" preset shows those do occur.
 */
export function cycleStep(current: StepValue, prefer: "D" | "U" = "D"): StepValue {
	const opposite: StepValue = prefer === "D" ? "U" : "D";
	const cycle: StepValue[] = ["", prefer, opposite, "X"];
	const idx = cycle.indexOf(current);
	// idx === -1 for D3/U3/DG/UG: (-1+1)%4 = 0 → "" which resets gracefully
	return cycle[(idx + 1) % cycle.length];
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
	return [
		...bars,
		{
			beats: bar.beats.map((beat) => [...beat]),
			chord: bar.chord,
			// A copy of an unfinished bar is still unfinished; dropping the name
			// would silently turn it into an ordinary chordless bar.
			...(bar.unknownChord ? { unknownChord: bar.unknownChord } : {}),
		},
	];
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

/**
 * Name a bar's chord, or take it away.
 *
 * Either answer retires a placeholder the bar was standing in for: the name the
 * player typed was a note-to-self about a chord they had not settled yet, and
 * once they have — or have deliberately cleared the bar — keeping it would put a
 * red word back on a bar they just finished.
 */
export function setBarChord(bars: Bar[], barIdx: number, chord: ChordRef | null): Bar[] {
	return bars.map((bar, i) => {
		if (i !== barIdx) return bar;
		const { unknownChord: _retired, ...rest } = bar;
		return { ...rest, chord };
	});
}

/** What pinning a shape needs to know about it: its id and the chord it is filed under. */
export interface VoicingPin {
	id: string;
	root: string;
	suffix: string;
}

/** How far writing a shape reaches: the one bar, or every bar of that chord. */
export type VoicingScope = "bar" | "chord";

/**
 * Which bars a shape written at `barIdx` reaches, index-aligned with `bars`.
 *
 * "Every bar of that chord" means two different things depending on the bar it
 * started from, and both are answered here so nothing has to ask twice: a
 * chorded bar reaches the bars playing the same chord, and a bar kept under a
 * name the library had no chord for reaches the bars kept under that same name.
 * They were written as one chord and are about to become one.
 */
export function voicingReach(
	bars: Bar[],
	barIdx: number,
	scope: VoicingScope,
): boolean[] {
	const source = bars[barIdx];
	if (!source) return bars.map(() => false);
	if (scope === "bar") return bars.map((_, i) => i === barIdx);

	const kept = barPlaceholder(source);
	if (kept) return bars.map((bar) => barPlaceholder(bar) === kept);

	const chord = source.chord;
	if (!chord) return bars.map((_, i) => i === barIdx);
	return bars.map((bar) => bar.chord?.root === chord.root && bar.chord?.suffix === chord.suffix);
}

/**
 * Pin a shape the player wrote onto the bars it reaches.
 *
 * A chorded bar keeps its chord and points at the new shape. A bar that was
 * only ever a name becomes the chord the shape was filed under — that shape is
 * the first record the chord exists at all — and its placeholder retires with
 * it. Bars outside the reach are returned by reference.
 */
export function applyVoicingToBars(
	bars: Bar[],
	barIdx: number,
	voicing: VoicingPin,
	scope: VoicingScope,
): Bar[] {
	const reach = voicingReach(bars, barIdx, scope);
	return bars.map((bar, i) => {
		if (!reach[i]) return bar;
		if (bar.chord) return { ...bar, chord: { ...bar.chord, voicingId: voicing.id } };
		if (!barPlaceholder(bar)) return bar;
		const { unknownChord: _named, ...rest } = bar;
		return {
			...rest,
			chord: { root: voicing.root, suffix: voicing.suffix, voicingId: voicing.id },
		};
	});
}

/**
 * Apply `fn` to one beat, returning the input untouched when nothing changed.
 *
 * The identity guarantee is load-bearing, not a micro-optimisation: the undo
 * history commits on reference change, so rebuilding the array regardless would
 * push an entry for every press of `+` at the maximum division, and undo would
 * then appear to do nothing several times in a row.
 */
function mapBeat(
	bars: Bar[],
	barIdx: number,
	beatIdx: number,
	fn: (beat: Beat) => Beat,
): Bar[] {
	if (barIdx < 0 || barIdx >= bars.length) return bars;
	const beats = bars[barIdx].beats;
	if (beatIdx < 0 || beatIdx >= beats.length) return bars;

	const next = fn(beats[beatIdx]);
	if (next === beats[beatIdx]) return bars;

	return bars.map((bar, bi) =>
		bi !== barIdx
			? bar
			: { ...bar, beats: bar.beats.map((beat, i) => (i === beatIdx ? next : beat)) },
	);
}

export function cycleCell(
	bars: Bar[],
	barIdx: number,
	beatIdx: number,
	cellIdx: number,
): Bar[] {
	return mapBeat(bars, barIdx, beatIdx, (beat) =>
		beat.map((cell, ci) =>
			// Even cells sit under a downstroke, odd cells under the upstroke that
			// returns from it — the same alternation the ghost cells encode.
			ci === cellIdx ? cycleStep(cell, ci % 2 === 0 ? "D" : "U") : cell,
		),
	);
}

/**
 * Write one cell outright, rather than cycling to it. What typing a stroke does,
 * where clicking cycles.
 */
export function setCell(
	bars: Bar[],
	barIdx: number,
	beatIdx: number,
	cellIdx: number,
	value: StepValue,
): Bar[] {
	return mapBeat(bars, barIdx, beatIdx, (beat) =>
		beat.map((cell, ci) => (ci === cellIdx ? value : cell)),
	);
}

/**
 * Re-divide every beat in a bar at once.
 *
 * Setting a bar to sixteenths took one press per beat before this, so four
 * presses stood between the player and an empty grid they could actually draw
 * on. Each beat resamples, so strokes already written keep their place in time.
 */
export function setBarCells(bars: Bar[], barIdx: number, cells: number): Bar[] {
	if (barIdx < 0 || barIdx >= bars.length) return bars;
	return bars.map((bar, i) =>
		i === barIdx ? { ...bar, beats: bar.beats.map((beat) => resizeBeat(beat, cells)) } : bar,
	);
}

/**
 * Copy one beat over another, inside the same bar.
 *
 * Copying, not inserting: a bar's beat count is fixed by its meter, so adding a
 * beat would put a 4/4 bar in five. The source's subdivision travels with it —
 * duplicating a beat of sixteenths onto a beat of eighths gives sixteenths,
 * which is what "duplicate" reads as and is still a legal width in either meter
 * family.
 *
 * Returns the input unchanged when either index is out of range or the two are
 * the same, so callers can wire it to a button without guarding first.
 */
export function copyBeat(
	bars: Bar[],
	barIdx: number,
	fromBeatIdx: number,
	toBeatIdx: number,
): Bar[] {
	if (barIdx < 0 || barIdx >= bars.length) return bars;
	const beats = bars[barIdx].beats;
	if (fromBeatIdx === toBeatIdx) return bars;
	if (fromBeatIdx < 0 || fromBeatIdx >= beats.length) return bars;
	if (toBeatIdx < 0 || toBeatIdx >= beats.length) return bars;

	return bars.map((bar, i) =>
		i === barIdx
			? {
					...bar,
					// A fresh array: the two beats must not share cells, or editing
					// one would silently rewrite the other.
					beats: bar.beats.map((beat, bi) =>
						bi === toBeatIdx ? [...beats[fromBeatIdx]] : beat,
					),
				}
			: bar,
	);
}

/**
 * Empty a beat, keeping its width.
 *
 * Clearing, not removing: the beat stays and keeps its division, so the bar's
 * shape is untouched and only what was struck goes. Cycling each cell back to
 * empty costs two or three clicks per cell, which is the one place a batch
 * operation still earns its keep now that writing a stroke is a single click.
 */
export function clearBeat(bars: Bar[], barIdx: number, beatIdx: number): Bar[] {
	return mapBeat(bars, barIdx, beatIdx, (beat) =>
		beat.every((cell) => cell === "") ? beat : beat.map(() => ""),
	);
}

/**
 * Exchange two beats inside a bar.
 *
 * Reordering, like copying, cannot change how many beats a bar has — that
 * belongs to the meter — so moving a beat is a swap with its neighbour rather
 * than a lift and reinsert. Widths travel with their beats.
 */
export function swapBeats(bars: Bar[], barIdx: number, a: number, b: number): Bar[] {
	if (barIdx < 0 || barIdx >= bars.length) return bars;
	const beats = bars[barIdx].beats;
	if (a === b) return bars;
	if (a < 0 || a >= beats.length || b < 0 || b >= beats.length) return bars;

	return bars.map((bar, i) =>
		i === barIdx
			? {
					...bar,
					beats: bar.beats.map((beat, bi) =>
						bi === a ? beats[b] : bi === b ? beats[a] : beat,
					),
				}
			: bar,
	);
}

/** A cell's address inside a `Bar[]`. */
export interface CellPosition {
	barIdx: number;
	beatIdx: number;
	cellIdx: number;
}

/**
 * The cell one step along from this one, walking beats and bars as it goes, or
 * null at either end of the pattern. Keyboard navigation reads a grid as one
 * line of cells; beat and bar boundaries are a drawing convention, not a wall.
 *
 * Deliberately does not wrap: arrowing off the end should stop, so holding the
 * key cannot silently carry the cursor back to the start.
 */
export function stepCellPosition(
	bars: Bar[],
	position: CellPosition,
	direction: 1 | -1,
): CellPosition | null {
	const flat: CellPosition[] = [];
	bars.forEach((bar, barIdx) =>
		bar.beats.forEach((beat, beatIdx) =>
			beat.forEach((_, cellIdx) => flat.push({ barIdx, beatIdx, cellIdx })),
		),
	);
	const i = flat.findIndex(
		(c) =>
			c.barIdx === position.barIdx &&
			c.beatIdx === position.beatIdx &&
			c.cellIdx === position.cellIdx,
	);
	if (i === -1) return null;
	return flat[i + direction] ?? null;
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
