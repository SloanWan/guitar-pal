import { decodeVoicingStrings } from "./chordVoicing";
import type { ChordVoicing } from "./chordVoicing";

// MIDI pitch of each open string: index 0 = string 6 (low E = E2), index 5 = string 1 (high e = E4)
export const GUITAR_OPEN_MIDI: readonly number[] = [40, 45, 50, 55, 59, 64];

// Pitch-class names, sharps only, indexed by `midi % 12`. Diagrams and the
// fretboard use it for note labels; key-aware spelling (flats) is the caller's job.
export const NOTE_NAMES: readonly string[] = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

// Display name of each string in GUITAR_OPEN_MIDI order (low E first).
export const STRING_LABELS: readonly string[] = ["E", "A", "D", "G", "B", "e"];

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

/** The MIDI pitches a voicing sounds, low string first — what a preview plays. */
export function voicingPitches(voicing: ChordVoicing): number[] {
  return chordVoicingToMidi(voicing).map((n) => n.midi);
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

const LETTER_PITCH_CLASS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Pitch class of a note name — a letter and at most one # or b — or undefined for anything else. */
export function rootPitchClass(root: string | undefined): number | undefined {
  if (root === undefined || root.length === 0 || root.length > 2) return undefined;
  const letter = LETTER_PITCH_CLASS[root[0]];
  const accidental = root.length === 1 ? 0 : root[1] === "#" ? 1 : root[1] === "b" ? -1 : undefined;
  if (letter === undefined || accidental === undefined) return undefined;
  return (letter + accidental + 12) % 12;
}
