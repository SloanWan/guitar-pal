/**
 * Which chords a hand can play from one position, without shifting.
 *
 * A five-fret window across six strings holds every pitch class, so a box
 * never limits which chords *exist* — only which shapes the hand can hold
 * there. The one fact that decides it is a shape's fretted notes: every one
 * of them must land inside the window. Open strings are free, wherever the
 * window is — they need no finger — and with a capo "open" means the capo
 * fret, which `decodeVoicingStrings` reports as 0 before the capo is added.
 *
 * Only shapes the library carries are considered; a chord whose every
 * voicing straddles the window is simply not reachable here. Deriving a shape
 * that the library does not have is the CAGED problem, and not this one.
 */
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";
import { decodeVoicingStrings } from "@/lib/chordVoicingToVexChords";
import { selectStandardVoicing } from "@/lib/selectStandardVoicing";

import type { KeyChord } from "./chords";
import type { FretWindow } from "./types";

/** A chord the hand can hold inside the window, with the shape that fits. */
export interface ReachableChord {
	chord: KeyChord;
	voicing: ChordVoicing;
}

/** Below this many, a position is not a place to play from and the frame says so. */
export const MIN_REACHABLE = 2;

/** Whether every fretted note of the shape, held above the capo, lies inside the window. */
export function voicingFits(voicing: ChordVoicing, capo: number, window: FretWindow): boolean {
	for (const { absoluteFret } of decodeVoicingStrings(voicing)) {
		if (absoluteFret === "x" || absoluteFret === 0) continue;
		const fret = absoluteFret + capo;
		if (fret < window.fromFret || fret > window.toFret) return false;
	}
	return true;
}

/**
 * The chords of `chords` that have a shape inside the window, in the order
 * given, each with the shape to show: the standard one when it fits, else the
 * fitting shape lowest on the neck. `voicingsOf` answers from whatever the
 * caller has loaded; a chord it has nothing for is not reachable.
 */
export function reachableChords(
	chords: readonly KeyChord[],
	voicingsOf: (chord: KeyChord) => readonly ChordVoicing[],
	window: FretWindow,
	capo: number,
): ReachableChord[] {
	const out: ReachableChord[] = [];
	for (const chord of chords) {
		const fitting = voicingsOf(chord).filter((v) => voicingFits(v, capo, window));
		const voicing = selectStandardVoicing(fitting);
		if (voicing) out.push({ chord, voicing });
	}
	return out;
}
