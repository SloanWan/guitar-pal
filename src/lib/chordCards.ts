// One card per voicing, as the chord page and the board draw it. Pure data shaping —
// unit-tested in __tests__/chordCards.test.ts.

import {
  voicingToDiagramShape,
  type ChordVoicing,
  type DiagramShape,
} from "@/lib/chordVoicing";
import { rootPitchClass, voicingPitches } from "@/lib/chordVoicingToMidi";
import { chordDisplayName, isSlashChord } from "@/lib/chordSuffixes";
import { omittedTones } from "@/lib/chordFormulas";

export interface VoicingCard {
  readonly id: string;
  readonly label: string;
  readonly def: DiagramShape;
  readonly pitches: readonly number[];
  /**
   * The bass note when this shape is an inversion — "D" under a Bm whose lowest
   * string sounds D — so the card can say `Bm/D` (#231). Null when the root is
   * in the bass, and in the three cases the name would say nothing new or
   * something wrong: a Standard (the audit keeps its root in the bass), a slash
   * chord (the name already names the bass), a rootless shape (no root to invert;
   * its `note` explains it instead).
   */
  readonly bass: string | null;
  /** The library's one-line caption for this shape, if it has one. */
  readonly note: string | null;
  /**
   * Chord tones this shape leaves out, as degrees ("5", "root") — empty when it
   * sounds them all or the suffix has no formula (#234). A rootless shape lists
   * "root" here and explains itself in `note`; the two lines agree by construction.
   */
  readonly omits: readonly string[];
}

// Spelled the way the root is: a flat root (Bb, Eb, Ab) gets a flat bass, any
// other root a sharp one. Not key-aware — the tables' own slash chords are not
// either (`F# /Bb`) — just consistent within one card.
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

export function spellBass(pitchClass: number, root: string): string {
  return (root.endsWith("b") ? FLAT_NAMES : SHARP_NAMES)[((pitchClass % 12) + 12) % 12];
}

function inversionBass(
  v: ChordVoicing,
  pitches: readonly number[],
  root: string,
  suffix: string,
): string | null {
  if (v.label === "Standard" || isSlashChord(suffix) || pitches.length === 0) return null;
  const rootPc = rootPitchClass(root);
  if (rootPc === undefined) return null;
  if (!pitches.some((p) => p % 12 === rootPc)) return null;
  const bassPc = Math.min(...pitches) % 12;
  return bassPc === rootPc ? null : spellBass(bassPc, root);
}

// A voicing row carries no guaranteed label, so fall back to its fret position.
// `root` and `suffix` are the chord the rows belong to; they decide the bass name.
export function toVoicingCards(
  voicings: readonly ChordVoicing[],
  root: string,
  suffix: string,
): VoicingCard[] {
  return voicings.map((v) => {
    const pitches = voicingPitches(v);
    return {
      id: v.id,
      label: v.label ?? `Pos. ${v.start_fret}`,
      def: voicingToDiagramShape(v),
      pitches,
      bass: inversionBass(v, pitches, root, suffix),
      note: v.note ?? null,
      omits: omittedTones(root, suffix, pitches),
    };
  });
}

// The inversion's name in the library's own slash notation: `Bm/D`, never
// "bass D" — it reads as what the shape is, not as a warning. Null when the
// card has no bass to name or the caller has no chord to name it after.
export function inversionName(
  card: Pick<VoicingCard, "bass">,
  root?: string,
  suffix?: string,
): string | null {
  if (!card.bass || !root || !suffix) return null;
  return `${chordDisplayName(root, suffix)}/${card.bass}`;
}
