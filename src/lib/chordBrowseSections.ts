// Pure functions to build BrowseSection arrays from chord data.
// Exported types (BrowseCard, BrowseSection, BrowseSubsection) are the single
// source of truth; BrowseGrid re-exports them for backward compatibility.

import {
  CHORD_SUFFIX_CATEGORIES,
  groupSuffixes,
  getSlashSuffixes,
  isSlashChord,
  EXCLUDED_SUFFIXES,
  sortRoots,
} from "@/lib/chordSuffixes";
import {
  selectStandardVoicing,
  chordVoicingToVexChords,
  type ChordVoicing,
  type VexChordDef,
} from "@/lib/chordVoicingToVexChords";

export interface BrowseCard {
  key: string;
  root: string;
  suffix: string;
  def: VexChordDef;
  label: string;
  href?: string;
}

export interface BrowseSubsection {
  label: string;
  cards: BrowseCard[];
}

export interface BrowseSection {
  label: string;
  cards: BrowseCard[];
  subsections?: BrowseSubsection[];
}

// Structurally compatible with ChordWithVoicings from @/lib/chords.
// Defined locally to avoid importing from a "use server" module.
interface ChordData {
  root: string;
  suffix: string;
  chord_voicings: ChordVoicing[];
}

function makeCard(
  chord: ChordData,
  labelMode: "suffix" | "root-suffix",
  buildHref?: (root: string, suffix: string) => string,
): BrowseCard | null {
  const voicing = selectStandardVoicing(chord.chord_voicings);
  if (!voicing) return null;
  return {
    key: `${chord.root}-${chord.suffix}`,
    root: chord.root,
    suffix: chord.suffix,
    def: chordVoicingToVexChords(voicing),
    label: labelMode === "suffix" ? chord.suffix : `${chord.root} ${chord.suffix}`,
    href: buildHref?.(chord.root, chord.suffix),
  };
}

export function buildRootSections(
  data: ChordData[],
  buildHref?: (root: string, suffix: string) => string,
): BrowseSection[] {
  const byRoot = new Map(data.map((c) => [c.suffix, c]));
  const suffixes = data.map((c) => c.suffix);
  const categoryGroups = groupSuffixes(suffixes);
  const slashSuffs = getSlashSuffixes(suffixes);

  function makeCards(suffs: readonly string[]): BrowseCard[] {
    return suffs.flatMap((s) => {
      const chord = byRoot.get(s);
      if (!chord) return [];
      const card = makeCard(chord, "root-suffix", buildHref);
      return card ? [card] : [];
    });
  }

  const sections: BrowseSection[] = categoryGroups
    .map(({ category, suffixes: gs }) => ({ label: category, cards: makeCards(gs) }))
    .filter((s) => s.cards.length > 0);

  const slashCards = makeCards(slashSuffs);
  if (slashCards.length > 0) sections.push({ label: "Slash Chords", cards: slashCards });

  return sections;
}

export function buildAllChordsRootFirst(
  allChords: ChordData[],
  buildHref?: (root: string, suffix: string) => string,
): BrowseSection[] {
  const rootOrder = sortRoots([...new Set(allChords.map((c) => c.root))]);
  return rootOrder.flatMap((root) => {
    const forRoot = allChords.filter((c) => c.root === root);
    const suffixes = forRoot.map((c) => c.suffix);
    const groups = groupSuffixes(suffixes);
    const slashSuffs = getSlashSuffixes(suffixes);
    const orderedSuffixes = [...groups.flatMap((g) => g.suffixes), ...slashSuffs];
    const cards = orderedSuffixes.flatMap((s) => {
      const chord = forRoot.find((c) => c.suffix === s);
      if (!chord) return [];
      const card = makeCard(chord, "root-suffix", buildHref);
      return card ? [card] : [];
    });
    return cards.length > 0 ? [{ label: root, cards }] : [];
  });
}

export function buildAllChordsCategories(
  allChords: ChordData[],
  buildHref?: (root: string, suffix: string) => string,
): BrowseSection[] {
  const rootOrder = sortRoots([...new Set(allChords.map((c) => c.root))]);

  function rootSubsections(
    filterFn: (c: ChordData) => boolean,
  ): BrowseSubsection[] {
    return rootOrder.flatMap((root) => {
      const cards = allChords
        .filter((c) => c.root === root && filterFn(c))
        .flatMap((c) => {
          const card = makeCard(c, "root-suffix", buildHref);
          return card ? [card] : [];
        });
      return cards.length > 0 ? [{ label: root, cards }] : [];
    });
  }

  const sections: BrowseSection[] = CHORD_SUFFIX_CATEGORIES.flatMap(({ category, suffixes }) => {
    const subs = rootSubsections((c) => suffixes.includes(c.suffix));
    return subs.length > 0 ? [{ label: category, cards: [], subsections: subs }] : [];
  });

  const slashSubs = rootSubsections(
    (c) => isSlashChord(c.suffix) && !EXCLUDED_SUFFIXES.includes(c.suffix),
  );
  if (slashSubs.length > 0) {
    sections.push({ label: "Slash Chords", cards: [], subsections: slashSubs });
  }

  return sections;
}
