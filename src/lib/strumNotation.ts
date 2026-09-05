import type { Beat, StepValue } from "@/lib/strumPatterns";

/**
 * The character a cell contributes to the written pattern. Every cell takes
 * exactly one column, so the writing keeps the grid's rhythm: cells nobody
 * strikes — ghosts (`DG`, `UG`, `G`) and rests — are written as a blank.
 * Triplet cells read as ordinary strokes; their grouping is the triplet.
 */
const CELL_LETTERS: Partial<Record<StepValue, string>> = {
	D: "D",
	U: "U",
	X: "X",
	D3: "D",
	U3: "U",
};

const BLANK = " ";

/** One beat's cells, one character each, e.g. `["D", "UG"]` → `"D "`. */
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
