import type { Beat } from "@/lib/strumPatterns";
import { beatNotation } from "@/lib/strumNotation";
import { allowedCellsPerBeat, beatsPerBar, naturalCellsPerBeat, type Meter } from "@/lib/strumMeter";
import { resizeBeat } from "@/lib/strumBarEdit";
import { parseRhythm, parseRhythmInMeter } from "@/lib/assistant/strum/parseRhythm";

/**
 * The pattern composer's two views of one rhythm — the strokes as typed, and
 * the grid — and the edits that keep them in step.
 */

/** Most bars a pattern may run to. */
export const MAX_PATTERN_BARS = 8;

/**
 * A rhythm as the composer writes it: every cell one character, blanks kept so
 * the subdivision survives, bars between `|`.
 */
export function rhythmText(rhythm: readonly Beat[][]): string {
	return rhythm.map((beats) => beats.map(beatNotation).join("").trimEnd()).join(" | ");
}

/** The one count every beat is divided into, or null when the beats differ. */
export function rhythmSubdivision(rhythm: readonly Beat[][]): number | null {
	const counts = new Set(rhythm.flat().map((beat) => beat.length));
	return counts.size === 1 ? [...counts][0] : null;
}

export type ComposerParse = { ok: true; rhythm: Beat[][] } | { ok: false; message: string };

/**
 * Read typed strokes into bars of the meter. At the chosen subdivision when what
 * was typed fits it; otherwise the subdivision follows the count, the way the
 * assistant reads a rhythm.
 */
export function parseComposerText(text: string, meter: Meter, subdivision: number | null): ComposerParse {
	const read = (): ComposerParse => {
		if (subdivision !== null && allowedCellsPerBeat(meter).includes(subdivision)) {
			const fitted = parseRhythm(text, { beatsPerBar: beatsPerBar(meter), cellsPerBeat: subdivision });
			if (fitted.ok) return { ok: true, rhythm: fitted.value.bars.map((bar) => bar.beats) };
			if (!fitted.errors.some((e) => e.code === "too-many-cells")) {
				return { ok: false, message: fitted.errors[0].message };
			}
		}
		const parsed = parseRhythmInMeter(text, meter);
		if (!parsed.ok) return { ok: false, message: parsed.errors[0].message };
		return { ok: true, rhythm: parsed.value.bars.map((bar) => bar.beats) };
	};
	const result = read();
	if (result.ok && result.rhythm.length > MAX_PATTERN_BARS) {
		return { ok: false, message: `A pattern runs to ${MAX_PATTERN_BARS} bars at most.` };
	}
	return result;
}

/** An empty bar of the meter, at a subdivision (its natural one by default). */
export function emptyRhythmBar(meter: Meter, cells: number = naturalCellsPerBeat(meter)): Beat[] {
	return Array.from({ length: beatsPerBar(meter) }, () => Array.from({ length: cells }, () => "" as const));
}

/** Every beat re-divided, strokes kept where they fall (`resizeBeat`). */
export function resizeRhythm(rhythm: readonly Beat[][], cells: number): Beat[][] {
	return rhythm.map((beats) => beats.map((beat) => resizeBeat(beat, cells)));
}

/** Grow with empty bars, or drop bars from the end; always at least one. */
export function setRhythmBarCount(rhythm: readonly Beat[][], count: number, meter: Meter): Beat[][] {
	const target = Math.min(MAX_PATTERN_BARS, Math.max(1, count));
	if (target <= rhythm.length) return rhythm.slice(0, target);
	const cells = rhythmSubdivision(rhythm) ?? naturalCellsPerBeat(meter);
	return [...rhythm, ...Array.from({ length: target - rhythm.length }, () => emptyRhythmBar(meter, cells))];
}

/** Take one bar out; the last one stays. */
export function removeRhythmBar(rhythm: readonly Beat[][], index: number): Beat[][] {
	if (rhythm.length <= 1) return [...rhythm];
	return rhythm.filter((_, i) => i !== index);
}
