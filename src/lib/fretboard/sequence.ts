/**
 * What a player plays: a list of steps, evenly spaced. A scale run is a step
 * per note; a chord progression is a step per bar, each sounding a whole
 * shape. The player does not know which it is given — it sounds the pitches
 * and says which step is up, and the page lights what the step names.
 */
import type { SlotNote, SlotPosition } from "./positions";

export interface SequenceStep {
	/** MIDI pitches sounded together, low to high: one for a note, several for a chord. */
	midis: readonly number[];
	/** The slots on the neck that sound them, for the board to light. */
	slots: readonly SlotPosition[];
}

/** A run's notes as steps, one note each. */
export function noteSteps(notes: readonly SlotNote[]): SequenceStep[] {
	return notes.map(({ string, fret, midi }) => ({ midis: [midi], slots: [{ string, fret }] }));
}
