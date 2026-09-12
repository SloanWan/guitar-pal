import type { Beat, StepValue } from "@/lib/strumPatterns";

/**
 * The character a cell contributes to the written pattern. Every cell takes
 * exactly one column, so the writing keeps the grid's rhythm: a cell nobody
 * strikes is written as a blank. Ghost strokes never appear here — they are
 * drawn from these cells, not written alongside them.
 */
const CELL_LETTERS: Partial<Record<StepValue, string>> = {
	D: "D",
	U: "U",
	X: "X",
};

const BLANK = " ";

/** One beat's cells, one character each, e.g. `["D", ""]` → `"D "`. */
export function beatNotation(beat: Beat): string {
	return beat.map((cell) => CELL_LETTERS[cell] ?? BLANK).join("");
}

/**
 * The written form of one bar of rhythm — every cell in order, blanks where
 * nothing is struck (`"D DU UD"`). This is the single source of a pattern's
 * description: derived on read, never stored, so it can never drift from the
 * beats. Trailing blanks are dropped; leading ones are kept, since they carry
 * the pattern's starting rest.
 */
export function patternNotation(beats: Beat[]): string {
	return beats.map(beatNotation).join("").trimEnd();
}
