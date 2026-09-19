/**
 * Which of a chord's shapes to hold for a key pressed in a given octave.
 *
 * A piano can voice a chord in any octave; a guitar changes register by
 * changing position, and the library carries a chord's shapes from the open
 * position up the neck. So the octave of the key pressed picks the shape:
 * the one whose highest sounding note lands nearest the key. Pressing a low
 * C gets the open C; pressing a high one gets the barre up the neck. A key
 * above anything the guitar can reach gets the highest shape there is.
 */
import type { ChordVoicing } from "@/lib/chordVoicing";

import { shapePitches } from "./chords";

/**
 * The shape whose top note is nearest `midi` once the capo is applied. Ties
 * go to the standard shape, then to the one lowest on the neck, so a key
 * that sits between two shapes gets the one a player would reach for first.
 */
export function voicingNearest(voicings: readonly ChordVoicing[], midi: number, capo: number): ChordVoicing | null {
	let best: { voicing: ChordVoicing; distance: number } | null = null;
	for (const voicing of voicings) {
		const pitches = shapePitches(voicing, capo);
		if (pitches.length === 0) continue;
		const distance = Math.abs(Math.max(...pitches) - midi);
		if (
			!best ||
			distance < best.distance ||
			(distance === best.distance &&
				(voicing.label === "Standard" && best.voicing.label !== "Standard"
					? true
					: voicing.label === best.voicing.label && voicing.start_fret < best.voicing.start_fret))
		) {
			best = { voicing, distance };
		}
	}
	return best?.voicing ?? null;
}
