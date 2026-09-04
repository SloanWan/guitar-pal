import { decodeVoicingStrings } from "./chordVoicingToVexChords";
import type { ChordVoicing } from "./chordVoicingToVexChords";

// MIDI pitch of each open string: index 0 = string 6 (low E = E2), index 5 = string 1 (high e = E4)
export const GUITAR_OPEN_MIDI: readonly number[] = [40, 45, 50, 55, 59, 64];

export interface ChordMidiNote {
  /** 0 = string 6 (low E), 5 = string 1 (high e) */
  stringIndex: number;
  midi: number;
}

/**
 * Convert a chord voicing to MIDI pitches for each active (non-muted) string.
 * Uses standard guitar tuning and the absolute fret numbers from decodeVoicingStrings.
 */
export function chordVoicingToMidi(voicing: ChordVoicing): ChordMidiNote[] {
  return decodeVoicingStrings(voicing)
    .filter(({ absoluteFret }) => absoluteFret !== "x")
    .map(({ stringIndex, absoluteFret }) => ({
      stringIndex,
      midi: GUITAR_OPEN_MIDI[stringIndex] + (absoluteFret as number),
    }));
}

// Pitch class (0-11) of a chord root, keyed by every spelling the tables use plus the
// enharmonic partners a caller might hand in. Diagrams use it to highlight root notes.
export const ROOT_PITCH_CLASS: Readonly<Record<string, number>> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

export function rootPitchClass(root: string | undefined): number | undefined {
  return root === undefined ? undefined : ROOT_PITCH_CLASS[root];
}
