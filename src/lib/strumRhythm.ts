import type { Bar, Beat, StrumPattern } from "@/lib/strumPatterns";
import { normalizeBeats, validateBars } from "@/lib/strumBars";
import { cycleStep } from "@/lib/strumBarEdit";

/**
 * A pattern's rhythm as bars, and how a chord sequence is laid over it.
 *
 * A pattern is one bar or a few that play in turn; a progression is one chord
 * per bar. The two are independent lengths, and this is the one place that
 * decides how they line up: bar `i` of a pass plays chord `i mod chords` over
 * rhythm bar `i mod rhythm`, and a pass is as long as the longer of the two. A
 * two-bar rhythm under a four-chord sequence therefore runs twice; a one-chord
 * sequence over a two-bar rhythm holds that chord through both.
 */

function copyBeats(beats: readonly Beat[]): Beat[] {
	return beats.map((beat) => [...beat]);
}

function sameBeats(a: readonly Beat[], b: readonly Beat[]): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** Every bar of a pattern's rhythm, first to last. Never empty. */
export function patternRhythm(pattern: StrumPattern): Beat[][] {
	return [normalizeBeats(pattern.beats), ...(pattern.extraBars ?? []).map(normalizeBeats)];
}

/**
 * The single read path for every pattern consumer: its rhythm as chordless
 * bars. Chord-carrying sequences are `ChordProgression`s, already `Bar[]`.
 */
export function toBars(pattern: StrumPattern): Bar[] {
	return patternRhythm(pattern).map((beats) => ({ beats, chord: null }));
}

/**
 * The pattern with a new rhythm: the first bar in `beats`, any further bars in
 * `extraBars`, which is left off entirely for a one-bar rhythm.
 */
export function withRhythm(pattern: StrumPattern, rhythm: readonly Beat[][]): StrumPattern {
	const { extraBars: _previous, ...rest } = pattern;
	void _previous;
	const [first = [], ...more] = rhythm;
	return more.length > 0
		? { ...rest, beats: copyBeats(first), extraBars: more.map(copyBeats) }
		: { ...rest, beats: copyBeats(first) };
}

/**
 * The bars after the first, read back from a row's `bars` column.
 *
 * The column has held `[{ beats, chord }]` since an earlier multi-bar model, and
 * is double-written with `beats` as its first bar. It is only trusted as a
 * rhythm when it still reads that way — first bar equal to `beats`, no chord on
 * any bar — so a row left over from the chord-carrying era stays the one bar it
 * has played as since.
 */
export function extraBarsFromColumn(beats: readonly Beat[], bars: unknown): Beat[][] | undefined {
	if (!Array.isArray(bars) || bars.length < 2 || !validateBars(bars).ok) return undefined;
	const stored = bars as Bar[];
	if (stored.some((bar) => bar.chord !== null && bar.chord !== undefined)) return undefined;
	if (!sameBeats(normalizeBeats(stored[0].beats), beats)) return undefined;
	return stored.slice(1).map((bar) => normalizeBeats(bar.beats));
}

/** The rhythm bar heard under bar `index` of a pass. */
export function rhythmBarAt(rhythm: readonly Beat[][], index: number): Beat[] {
	return rhythm[((index % rhythm.length) + rhythm.length) % rhythm.length] ?? [];
}

/**
 * What one pass plays: the sequence's chords over the pattern's rhythm, or the
 * rhythm alone when no sequence is open.
 */
export function progressionPlayback(
	rhythm: readonly Beat[][],
	progression: { bars: readonly Bar[] } | null,
): Bar[] {
	if (!progression || progression.bars.length === 0) {
		return rhythm.map((beats) => ({ beats: copyBeats(beats), chord: null }));
	}
	const chords = progression.bars;
	const length = Math.max(rhythm.length, chords.length);
	return Array.from({ length }, (_, i) => ({
		...chords[i % chords.length],
		beats: copyBeats(rhythmBarAt(rhythm, i)),
	}));
}

/**
 * Write the pattern's rhythm into a sequence's bars, so what is stored reads the
 * way it plays. Chords and kept names are untouched. Returns the input array
 * when every bar already matches, so a caller can skip the write.
 */
export function alignToRhythm(bars: Bar[], rhythm: readonly Beat[][]): Bar[] {
	if (followsRhythm(bars, rhythm)) return bars;
	return bars.map((bar, i) => ({ ...bar, beats: copyBeats(rhythmBarAt(rhythm, i)) }));
}

/** Whether every bar of a sequence already plays the rhythm it is laid over. */
export function followsRhythm(bars: readonly Bar[], rhythm: readonly Beat[][]): boolean {
	return bars.every((bar, i) => sameBeats(bar.beats, rhythmBarAt(rhythm, i)));
}

/**
 * The shortest rhythm a run of bars repeats: four bars of one rhythm are one bar,
 * A B A B is two. What a proposal's bars, or a sequence written before every
 * sequence followed its pattern, hold as a pattern.
 */
export function rhythmOfBars(bars: readonly Bar[]): Beat[][] {
	const n = bars.length;
	for (let period = 1; period < n; period++) {
		if (bars.every((bar, i) => sameBeats(bar.beats, bars[i % period].beats))) {
			return bars.slice(0, period).map((bar) => copyBeats(bar.beats));
		}
	}
	return bars.map((bar) => copyBeats(bar.beats));
}

/**
 * Cycle one cell of a rhythm, the way a click on the grid does: an even cell
 * leads with a downstroke, an odd one with the upstroke that returns from it.
 */
export function cycleRhythmCell(rhythm: readonly Beat[][], bar: number, beat: number, cell: number): Beat[][] {
	return rhythm.map((beats, bi) =>
		bi !== bar
			? beats
			: beats.map((cells, ti) =>
					ti !== beat ? cells : cells.map((value, ci) => (ci === cell ? cycleStep(value, ci % 2 === 0 ? "D" : "U") : value)),
				),
	);
}
