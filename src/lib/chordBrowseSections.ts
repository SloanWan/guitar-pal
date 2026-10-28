// One root's chords grouped by quality, for the hub's "By root" view and the
// chord page's library.

import { groupSuffixes, getSlashSuffixes } from "@/lib/chordSuffixes";
import { voicingToDiagramShape, type ChordVoicing, type DiagramShape } from "@/lib/chordVoicing";
import { selectStandardVoicing } from "@/lib/selectStandardVoicing";

export interface BrowseCard {
  key: string;
  root: string;
  suffix: string;
  /** The chord's standard shape. */
  def: DiagramShape;
}

export interface BrowseSection {
  label: string;
  cards: BrowseCard[];
}

// Structurally compatible with ChordWithVoicings; declared here so this module
// never imports a Supabase-touching one.
interface ChordData {
  root: string;
  suffix: string;
  chord_voicings: ChordVoicing[];
}

function makeCard(chord: ChordData): BrowseCard | null {
  const voicing = selectStandardVoicing(chord.chord_voicings);
  if (!voicing) return null;
  return { key: `${chord.root}-${chord.suffix}`, root: chord.root, suffix: chord.suffix, def: voicingToDiagramShape(voicing) };
}

/** One root's chords as sections by quality, slash chords last; chords with no shape are left out. */
export function buildRootSections(data: readonly ChordData[]): BrowseSection[] {
  const bySuffix = new Map(data.map((c) => [c.suffix, c]));
  const suffixes = data.map((c) => c.suffix);

  const makeCards = (suffs: readonly string[]): BrowseCard[] =>
    suffs.flatMap((s) => {
      const chord = bySuffix.get(s);
      const card = chord ? makeCard(chord) : null;
      return card ? [card] : [];
    });

  const sections: BrowseSection[] = groupSuffixes(suffixes)
    .map(({ category, suffixes: gs }) => ({ label: category, cards: makeCards(gs) }))
    .filter((s) => s.cards.length > 0);

  const slashCards = makeCards(getSlashSuffixes(suffixes));
  if (slashCards.length > 0) sections.push({ label: "Slash Chords", cards: slashCards });

  return sections;
}
