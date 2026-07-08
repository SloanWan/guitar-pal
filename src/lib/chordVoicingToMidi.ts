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
