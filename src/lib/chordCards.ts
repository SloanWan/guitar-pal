// View models handed from the server to the chord diagram components: one card per
// voicing, and one card per token of a batch query. Pure data shaping — unit-tested in
// __tests__/chordCards.test.ts — so the routes stay thin fetch-and-render shells.

import {
  chordVoicingToVexChords,
  type ChordVoicing,
  type VexChordDef,
} from "@/lib/chordVoicingToVexChords";
import { chordVoicingToMidi } from "@/lib/chordVoicingToMidi";
import { selectStandardVoicing } from "@/lib/selectStandardVoicing";
import { chordDisplayName } from "@/lib/chordSuffixes";
import type { BatchToken } from "@/lib/chordBatchResolve";

export interface VoicingCard {
  readonly id: string;
  readonly label: string;
  readonly def: VexChordDef;
  readonly pitches: readonly number[];
}

// Structurally compatible with ChordWithVoicings from the data layer; declared locally
// so this module never has to import a Supabase-touching one.
export interface ChordWithVoicingsLike {
  readonly root: string;
  readonly suffix: string;
  readonly chord_voicings: ChordVoicing[];
}

// A voicing row carries no guaranteed label, so fall back to its fret position.
export function toVoicingCards(voicings: readonly ChordVoicing[]): VoicingCard[] {
  return voicings.map((v) => ({
    id: v.id,
    label: v.label ?? `Pos. ${v.start_fret}`,
    def: chordVoicingToVexChords(v),
    pitches: chordVoicingToMidi(v).map(({ midi }) => midi),
  }));
}

export interface BatchGridHit {
  readonly key: string;
  readonly status: "resolved";
  readonly token: string; // as the user typed it
  readonly root: string;
  readonly suffix: string;
  readonly label: string;
  readonly voicings: VoicingCard[];
  /** Index of the Standard voicing within `voicings` — the shape shown on the card. */
  readonly standardIndex: number;
}

export interface BatchGridMiss {
  readonly key: string;
  readonly status: "not_found";
  readonly token: string;
}

export type BatchGridCard = BatchGridHit | BatchGridMiss;

function pairKey(root: string, suffix: string): string {
  return `${root}|${suffix}`;
}

// The (root, suffix) pairs a batch needs loading, de-duplicated: a progression may
// repeat a chord (C Am C G) and that must not repeat the fetch.
export function batchChordPairs(
  tokens: readonly BatchToken[],
): { root: string; suffix: string }[] {
  const unique = new Map<string, { root: string; suffix: string }>();
  for (const token of tokens) {
    if (token.status === "resolved") {
      unique.set(pairKey(token.root, token.suffix), { root: token.root, suffix: token.suffix });
    }
  }
  return [...unique.values()];
}

// Joins resolved tokens back onto the loaded chords, preserving the order and the
// duplicates of the original query. A token that resolved against the search index but
// has no voicing row can only happen if the two tables disagree; it degrades to a
// "not found" card rather than rendering an empty one.
export function buildBatchGridCards(
  tokens: readonly BatchToken[],
  chords: readonly ChordWithVoicingsLike[],
): BatchGridCard[] {
  const byPair = new Map(chords.map((c) => [pairKey(c.root, c.suffix), c]));

  return tokens.map((token) => {
    const miss: BatchGridMiss = { key: token.key, status: "not_found", token: token.token };
    if (token.status !== "resolved") return miss;

    const chord = byPair.get(pairKey(token.root, token.suffix));
    if (!chord) return miss;
    const standard = selectStandardVoicing(chord.chord_voicings);
    if (!standard) return miss;

    return {
      key: token.key,
      status: "resolved",
      token: token.token,
      root: token.root,
      suffix: token.suffix,
      label: chordDisplayName(token.root, token.suffix),
      voicings: toVoicingCards(chord.chord_voicings),
      standardIndex: Math.max(
        chord.chord_voicings.findIndex((v) => v.id === standard.id),
        0,
      ),
    };
  });
}
