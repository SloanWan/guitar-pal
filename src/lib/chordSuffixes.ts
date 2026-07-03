export interface SuffixCategoryDef {
  readonly category: string;
  readonly suffixes: readonly string[];
}

export const CHORD_SUFFIX_CATEGORIES: readonly SuffixCategoryDef[] = [
  { category: "Major",        suffixes: ["major","6","69","add9","maj7","maj9","maj11","maj13","maj7#5","maj7b5"] },
  { category: "Minor",        suffixes: ["minor","m6","m69","madd9","m7","m9","m11","mmaj7","mmaj9","mmaj11","mmaj7b5"] },
  { category: "Dominant 7th", suffixes: ["7","9","11","13","7#9","7b5","7b9","9#11","9b5","alt"] },
  { category: "Suspended",    suffixes: ["sus2","sus4","7sus4"] },
  { category: "Diminished",   suffixes: ["dim","dim7"] },
  { category: "Augmented",    suffixes: ["aug","aug7","aug9"] },
];

// Slash chords / inversions detected by pattern — separate axis from chord quality,
// so they are not part of CHORD_SUFFIX_CATEGORIES.

// 3 rows under root="C" with suffix="7sg" are mislabeled C7 voicings — excluded at UI
// layer only; data cleanup is a separate chore.
export const EXCLUDED_SUFFIXES: readonly string[] = ["7sg"];

export function isSlashChord(suffix: string): boolean {
  return suffix.startsWith("/") || suffix.startsWith("m/");
}

// Returns the category name for a suffix, or null if it belongs to none.
export function getSuffixCategory(suffix: string): string | null {
  for (const { category, suffixes } of CHORD_SUFFIX_CATEGORIES) {
    if (suffixes.includes(suffix)) return category;
  }
  return null;
}

// Intersects `available` with the taxonomy, in taxonomy order.
// Excluded and slash-chord suffixes are stripped.
export function groupSuffixes(available: readonly string[]): SuffixCategoryDef[] {
  const valid = new Set(
    available.filter(s => !EXCLUDED_SUFFIXES.includes(s) && !isSlashChord(s))
  );
  return CHORD_SUFFIX_CATEGORIES.flatMap(({ category, suffixes }) => {
    const present = suffixes.filter(s => valid.has(s));
    return present.length > 0 ? [{ category, suffixes: present }] : [];
  });
}

// Returns slash chords present in `available`, excluding EXCLUDED_SUFFIXES.
export function getSlashSuffixes(available: readonly string[]): string[] {
  return Array.from(available).filter(
    s => !EXCLUDED_SUFFIXES.includes(s) && isSlashChord(s)
  );
}
