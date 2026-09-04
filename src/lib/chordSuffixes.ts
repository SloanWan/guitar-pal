// Chromatic pitch order for all 12 roots in the chords table.
export const ROOT_CHROMATIC_ORDER: readonly string[] = [
  "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
];

const ROOT_INDEX = new Map(ROOT_CHROMATIC_ORDER.map((r, i) => [r, i]));

// Sorts an array of root strings into chromatic pitch order.
// Roots absent from ROOT_CHROMATIC_ORDER sort to the end (stable relative order).
export function sortRoots(roots: readonly string[]): string[] {
  return [...roots].sort(
    (a, b) => (ROOT_INDEX.get(a) ?? 999) - (ROOT_INDEX.get(b) ?? 999),
  );
}

export interface SuffixCategoryDef {
  readonly category: string;
  readonly suffixes: readonly string[];
}

export const CHORD_SUFFIX_CATEGORIES: readonly SuffixCategoryDef[] = [
  { category: "Major",        suffixes: ["major","6","69","add9","add11","maj7","maj7sus2","maj9","maj11","maj13","maj7#5","maj7b5"] },
  { category: "Minor",        suffixes: ["minor","m6","m69","madd9","m7","m9","m11","mmaj7","mmaj9","mmaj11","mmaj7b5"] },
  { category: "Dominant 7th", suffixes: ["7","9","11","13","7#9","7b5","7b9","9#11","9b5","alt"] },
  { category: "Suspended",    suffixes: ["sus","sus2","sus4","sus2sus4","7sus4"] },
  { category: "Diminished",   suffixes: ["dim","dim7","m7b5"] },
  { category: "Augmented",    suffixes: ["aug","aug7","aug9"] },
  { category: "Power Chord",  suffixes: ["5"] },
];

// Slash chords / inversions detected by pattern — separate axis from chord quality,
// so they are not part of CHORD_SUFFIX_CATEGORIES.

// suffix="7sg" rows are mislabeled dominant-7 voicings — excluded at the UI layer
// only; data cleanup is a separate chore.
export const EXCLUDED_SUFFIXES: readonly string[] = ["7sg"];

export function isSlashChord(suffix: string): boolean {
  return suffix.includes("/");
}

// Returns the category name for a suffix, or null if it belongs to none.
export function getSuffixCategory(suffix: string): string | null {
  for (const { category, suffixes } of CHORD_SUFFIX_CATEGORIES) {
    if (suffixes.includes(suffix)) return category;
  }
  return null;
}

// Single source of truth for "should this suffix be reachable in the product":
// a suffix is browsable iff it is not excluded AND it either belongs to a quality
// category or is a slash chord. Both the browse builders and the search index derive
// visibility from this predicate so the two can never drift apart. Any suffix that
// fails this (an "orphan") is enforced against by the invariant test in
// chordSuffixes.test.ts — it must be categorised or excluded, never silently hidden.
export function isBrowsableSuffix(suffix: string): boolean {
  if (EXCLUDED_SUFFIXES.includes(suffix)) return false;
  return getSuffixCategory(suffix) !== null || isSlashChord(suffix);
}

// Intersects `available` with the taxonomy, in taxonomy order.
// Excluded and slash-chord suffixes are stripped.
export function groupSuffixes(available: readonly string[]): SuffixCategoryDef[] {
  const valid = new Set(
    available.filter(s => isBrowsableSuffix(s) && !isSlashChord(s))
  );
  return CHORD_SUFFIX_CATEGORIES.flatMap(({ category, suffixes }) => {
    const present = suffixes.filter(s => valid.has(s));
    return present.length > 0 ? [{ category, suffixes: present }] : [];
  });
}

// Returns slash chords present in `available`, excluding EXCLUDED_SUFFIXES.
export function getSlashSuffixes(available: readonly string[]): string[] {
  return Array.from(available).filter(
    s => isBrowsableSuffix(s) && isSlashChord(s)
  );
}

// Display name for a chord. Chord names read best compact (Cm7, Cmaj7), but slash
// chords already carry their own separator, so no extra space there.
export function chordDisplayName(root: string, suffix: string): string {
  return isSlashChord(suffix) ? `${root}${suffix}` : `${root} ${suffix}`;
}
