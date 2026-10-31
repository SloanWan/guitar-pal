import type { Beat, StepValue } from "@/lib/strumPatterns";

/**
 * A rendered column: a struck cell, a ghost stroke (`DG`/`UG` — the hand
 * travelling, drawn faint), or `"G"`, the pure padding column the grid draws
 * blank. None of the three beyond `StepValue` is ever stored, and none reaches
 * the audio engine.
 */
export type DisplayCell = StepValue | "DG" | "UG" | "G";

/** A beat with its padding filled in — what the grid actually renders. */
export function paddedBeatCells(beat: readonly DisplayCell[]): DisplayCell[] {
	if (beat.length === 1) return [beat[0], "G", "UG", "G"];
	if (beat.length === 2) return [beat[0], "G", beat[1], "G"];
	return [...beat];
}

/**
 * Draw the hand between the strikes.
 *
 * A strummed bar is played by a hand that keeps moving whether or not it meets
 * the strings, and showing where it is travelling is what makes a written
 * pattern playable. That is a reading of the rhythm, not part of it, so it is
 * derived here rather than stored: every unstruck cell between the first and
 * last strike is a ghost, plus the one cell after the last strike — the return
 * from it — and the direction follows the cell's place in its beat, even down
 * and odd up, the same alternation `cycleStep` leads with.
 *
 * The rule is calibrated against the ghosts the shipped presets used to carry
 * one by one; see the test.
 */
export function ghostedBeats(beats: readonly Beat[]): DisplayCell[][] {
	const flat = beats.flat();
	const first = flat.findIndex((cell) => cell !== "");
	if (first === -1) return beats.map((beat) => [...beat]);
	const last = flat.length - 1 - [...flat].reverse().findIndex((cell) => cell !== "");

	let i = -1;
	return beats.map((beat) =>
		beat.map((cell, cellIdx): DisplayCell => {
			i++;
			if (cell !== "") return cell;
			const travelling = i > first && (i < last || i === last + 1);
			if (!travelling) return "";
			return cellIdx % 2 === 0 ? "DG" : "UG";
		}),
	);
}
