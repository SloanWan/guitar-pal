// What a chord *is*, by suffix: the tones it may sound and the ones it cannot
// do without. One table serves two readers — the chord page, which spells a
// chord's tones for the player, and scripts/audit-chord-voicings.ts, which
// holds every stored voicing to it — so the two can never disagree about what
// a chord is (#234).
//
// Semitones from the root: 0 R · 1 ♭9 · 2 9 · 3 m3/♯9 · 4 M3 · 5 11 · 6 ♭5/♯11
// · 7 5 · 8 ♯5/♭13 · 9 6/13 · 10 ♭7 · 11 M7.
//
// `allowed`: the only tones the shape may sound. `must`: tones without which it
// is a different chord — each entry is a list of alternatives, any one of which
// satisfies it (maj11 wants an 11th, natural or sharp). The 5th is optional
// everywhere it is unaltered; a 9th is required where it names the chord.
// The table is the spec; change it here, not in the code below.

export interface Formula {
  readonly allowed: readonly number[];
  readonly must: readonly (readonly number[])[];
}

const one = (...tones: number[]): (readonly number[])[] => tones.map((t) => [t]);

export const FORMULAS: Readonly<Record<string, Formula>> = {
  // triads
  major: { allowed: [0, 4, 7], must: one(0, 4) },
  minor: { allowed: [0, 3, 7], must: one(0, 3) },
  dim: { allowed: [0, 3, 6], must: one(0, 3, 6) },
  aug: { allowed: [0, 4, 8], must: one(0, 4, 8) },
  "5": { allowed: [0, 7], must: one(0, 7) },
  // suspensions
  sus: { allowed: [0, 5, 7], must: one(0, 5) },
  sus4: { allowed: [0, 5, 7], must: one(0, 5) },
  sus2: { allowed: [0, 2, 7], must: one(0, 2) },
  sus2sus4: { allowed: [0, 2, 5, 7], must: one(0, 2, 5) },
  "7sus4": { allowed: [0, 5, 7, 10], must: one(0, 5, 10) },
  maj7sus2: { allowed: [0, 2, 7, 11], must: one(0, 2, 11) },
  // added tones and sixths
  add9: { allowed: [0, 2, 4, 7], must: one(0, 2, 4) },
  madd9: { allowed: [0, 2, 3, 7], must: one(0, 2, 3) },
  add11: { allowed: [0, 4, 5, 7], must: one(0, 4, 5) },
  "6": { allowed: [0, 4, 7, 9], must: one(0, 4, 9) },
  m6: { allowed: [0, 3, 7, 9], must: one(0, 3, 9) },
  "69": { allowed: [0, 2, 4, 7, 9], must: one(0, 2, 4, 9) },
  m69: { allowed: [0, 2, 3, 7, 9], must: one(0, 2, 3, 9) },
  // dominant family
  "7": { allowed: [0, 4, 7, 10], must: one(0, 4, 10) },
  "9": { allowed: [0, 2, 4, 7, 10], must: one(0, 2, 4, 10) },
  "11": { allowed: [0, 2, 4, 5, 7, 10], must: one(0, 5, 10) },
  "13": { allowed: [0, 2, 4, 5, 7, 9, 10], must: one(0, 4, 9, 10) },
  "7b5": { allowed: [0, 4, 6, 10], must: one(0, 4, 6, 10) },
  "9b5": { allowed: [0, 2, 4, 6, 10], must: one(0, 2, 4, 6, 10) },
  aug7: { allowed: [0, 4, 8, 10], must: one(0, 4, 8, 10) },
  aug9: { allowed: [0, 2, 4, 8, 10], must: one(0, 2, 4, 8, 10) },
  "7b9": { allowed: [0, 1, 4, 7, 10], must: one(0, 1, 4, 10) },
  "7#9": { allowed: [0, 3, 4, 7, 10], must: one(0, 3, 4, 10) },
  // Upstream drops the 9th from half its 9#11 shapes (a 7#11 in all but name).
  "9#11": { allowed: [0, 2, 4, 6, 7, 10], must: one(0, 4, 6, 10) },
  // Not the jazz altered dominant: in this library "alt" is the major ♭5 triad,
  // 47 of 48 upstream shapes. Renaming the suffix is a separate decision.
  alt: { allowed: [0, 4, 6], must: one(0, 4, 6) },
  // major-seventh family
  maj7: { allowed: [0, 4, 7, 11], must: one(0, 4, 11) },
  maj9: { allowed: [0, 2, 4, 7, 11], must: one(0, 2, 4, 11) },
  maj11: { allowed: [0, 2, 4, 5, 6, 7, 11], must: [...one(0, 11), [5, 6]] },
  maj13: { allowed: [0, 2, 4, 5, 6, 7, 9, 11], must: one(0, 4, 9, 11) },
  "maj7b5": { allowed: [0, 4, 6, 11], must: one(0, 4, 6, 11) },
  "maj7#5": { allowed: [0, 4, 8, 11], must: one(0, 4, 8, 11) },
  // minor-seventh family
  m7: { allowed: [0, 3, 7, 10], must: one(0, 3, 10) },
  m9: { allowed: [0, 2, 3, 7, 10], must: one(0, 2, 3, 10) },
  m11: { allowed: [0, 2, 3, 5, 7, 10], must: one(0, 3, 5, 10) },
  "m7b5": { allowed: [0, 3, 6, 10], must: one(0, 3, 6, 10) },
  dim7: { allowed: [0, 3, 6, 9], must: one(0, 3, 6, 9) },
  mmaj7: { allowed: [0, 3, 7, 11], must: one(0, 3, 11) },
  mmaj9: { allowed: [0, 2, 3, 7, 11], must: one(0, 2, 3, 11) },
  mmaj11: { allowed: [0, 2, 3, 5, 7, 11], must: one(0, 3, 5, 11) },
  "mmaj7b5": { allowed: [0, 3, 6, 11], must: one(0, 3, 6, 11) },
};

// The suffix before the slash, as the tables spell it.
export const SLASH_BASE: Readonly<Record<string, string>> = { "": "major", m: "minor" };

// The full name a chart or a teacher would say. "alt" is named for what the
// library's shapes are, not for the jazz chord of that name.
export const QUALITY_NAMES: Readonly<Record<string, string>> = {
  major: "major triad",
  minor: "minor triad",
  dim: "diminished triad",
  aug: "augmented triad",
  "5": "power chord",
  sus: "suspended fourth",
  sus4: "suspended fourth",
  sus2: "suspended second",
  sus2sus4: "suspended second and fourth",
  "7sus4": "dominant seventh suspended fourth",
  maj7sus2: "major seventh suspended second",
  add9: "added ninth",
  madd9: "minor added ninth",
  add11: "added eleventh",
  "6": "major sixth",
  m6: "minor sixth",
  "69": "six-nine",
  m69: "minor six-nine",
  "7": "dominant seventh",
  "9": "dominant ninth",
  "11": "dominant eleventh",
  "13": "dominant thirteenth",
  "7b5": "dominant seventh flat five",
  "9b5": "dominant ninth flat five",
  aug7: "augmented seventh",
  aug9: "augmented ninth",
  "7b9": "dominant seventh flat nine",
  "7#9": "dominant seventh sharp nine",
  "9#11": "dominant ninth sharp eleven",
  alt: "major flat five",
  maj7: "major seventh",
  maj9: "major ninth",
  maj11: "major eleventh",
  maj13: "major thirteenth",
  "maj7b5": "major seventh flat five",
  "maj7#5": "major seventh sharp five",
  m7: "minor seventh",
  m9: "minor ninth",
  m11: "minor eleventh",
  "m7b5": "half-diminished seventh",
  dim7: "diminished seventh",
  mmaj7: "minor-major seventh",
  mmaj9: "minor-major ninth",
  mmaj11: "minor-major eleventh",
  "mmaj7b5": "minor-major seventh flat five",
};

export interface ChordSpec {
  /** The suffix the formula was found under — the part before any slash. */
  readonly baseSuffix: string;
  readonly formula: Formula;
  /** The bass a slash suffix names (`/G` → "G"), as the tables spell it. */
  readonly slashBass: string | null;
}

/** The formula behind a suffix, with a slash chord's bass split off; null for a suffix the table does not know. */
export function chordSpec(suffix: string): ChordSpec | null {
  const slash = suffix.indexOf("/");
  const baseSuffix = slash === -1 ? suffix : (SLASH_BASE[suffix.slice(0, slash)] ?? suffix.slice(0, slash));
  const formula = FORMULAS[baseSuffix];
  if (!formula) return null;
  return { baseSuffix, formula, slashBass: slash === -1 ? null : suffix.slice(slash + 1) };
}

// ── Degrees ──────────────────────────────────────────────────────────────────
// A semitone means different things in different chords: 6 is the ♭5 of a 7b5
// but the ♯11 of a 9#11, 9 the 6th of a 6 chord but the 13th of a 13. `steps`
// is how many letters up from the root the degree is written — a 9th on C is a
// D whatever its accidental — and is what the spelling below stacks on.

export interface Degree {
  readonly name: string;
  readonly steps: number;
}

export function degreeOf(semitones: number, formula: Formula, baseSuffix: string): Degree {
  const has = (t: number) => formula.allowed.includes(t);
  const hasThird = has(3) || has(4);
  const hasSeventh = has(10) || has(11);
  switch (((semitones % 12) + 12) % 12) {
    case 0: return { name: "1", steps: 0 };
    case 1: return { name: "♭9", steps: 1 };
    case 2: return hasThird ? { name: "9", steps: 1 } : { name: "2", steps: 1 };
    case 3: return has(4) ? { name: "♯9", steps: 1 } : { name: "♭3", steps: 2 };
    case 4: return { name: "3", steps: 2 };
    case 5: return hasThird ? { name: "11", steps: 3 } : { name: "4", steps: 3 };
    case 6: return has(7) ? { name: "♯11", steps: 3 } : { name: "♭5", steps: 4 };
    case 7: return { name: "5", steps: 4 };
    case 8: return has(7) ? { name: "♭13", steps: 5 } : { name: "♯5", steps: 4 };
    case 9:
      if (baseSuffix === "dim7") return { name: "♭♭7", steps: 6 };
      return hasSeventh ? { name: "13", steps: 5 } : { name: "6", steps: 5 };
    case 10: return { name: "♭7", steps: 6 };
    default: return { name: "7", steps: 6 };
  }
}

// ── Spelling ─────────────────────────────────────────────────────────────────
// Decided under #234: spell by interval — each degree on the letter its `steps`
// say, with whatever accidental lands it on the pitch — then fold the four
// names a chart would not print (E♯ B♯ C♭ F♭) and any double accidental to
// their enharmonics. So C9 reads C E G B♭ D, D7 reads D F♯ A C, C♯maj7 reads
// C♯ F G♯ C. (This is a spelling for a scale degree; the bass name on a card,
// #231, is a name for a shape and follows the root's accidental instead.)

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const LETTER_PC: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;
const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"] as const;
const FOLD: Readonly<Record<string, string>> = { "E♯": "F", "B♯": "C", "C♭": "B", "F♭": "E" };

/** Pitch class of a root as the tables spell it (C, C#, Db, …); undefined for a root that is not a note. */
export function rootPc(root: string): number | undefined {
  const letter = LETTER_PC[root[0]];
  if (letter === undefined || root.length > 2) return undefined;
  const accidental = root[1] === "#" ? 1 : root[1] === "b" ? -1 : root.length === 1 ? 0 : undefined;
  if (accidental === undefined) return undefined;
  return (letter + accidental + 12) % 12;
}

/** A chord name's accidentals as glyphs: "Bb" → "B♭", "C#" → "C♯". For notes, not prose. */
export function withGlyphs(name: string): string {
  return name.replace(/b/g, "♭").replace(/#/g, "♯");
}

export function spellDegree(root: string, semitones: number, steps: number): string {
  const pc = rootPc(root);
  const rootLetter = LETTERS.indexOf(root[0] as (typeof LETTERS)[number]);
  if (pc === undefined || rootLetter === -1) return "?";
  const targetPc = (pc + semitones) % 12;
  const letter = LETTERS[(rootLetter + steps) % 7];
  const accidental = ((targetPc - LETTER_PC[letter] + 6 + 12) % 12) - 6;
  if (Math.abs(accidental) > 1) return (root.includes("b") ? FLAT_NAMES : SHARP_NAMES)[targetPc];
  const spelled = accidental === 1 ? `${letter}♯` : accidental === -1 ? `${letter}♭` : letter;
  return FOLD[spelled] ?? spelled;
}

export interface ChordTone {
  readonly semitones: number;
  /** The degree as a chart writes it: "1", "♭3", "♯11" … */
  readonly degree: string;
  /** The note, spelled by interval: "B♭" in C9, "F" (not E♯) in C♯maj7. */
  readonly note: string;
}

/** Every tone the chord may sound, root first and stacked upward the way the name reads (1 3 5 ♭7 9 …). */
export function chordTones(root: string, suffix: string): ChordTone[] | null {
  const spec = chordSpec(suffix);
  if (!spec || rootPc(root) === undefined) return null;
  const { formula, baseSuffix } = spec;
  // Stacked in thirds: the 9th is written a letter above the root but read
  // after the 7th, so an extension sorts a full octave of letters later.
  const order = ({ name, steps }: Degree) => steps + (/9|11|13/.test(name) ? 7 : 0);
  return formula.allowed
    .map((semitones) => {
      const degree = degreeOf(semitones, formula, baseSuffix);
      return { semitones, degree: degree.name, note: spellDegree(root, semitones, degree.steps), order: order(degree) };
    })
    .sort((a, b) => a.order - b.order || a.semitones - b.semitones)
    .map(({ semitones, degree, note }) => ({ semitones, degree, note }));
}

/**
 * The chord tones a voicing leaves out, as degrees ("5", "root"), given the
 * pitches it sounds. The whole `allowed` set is measured, not just the must-
 * tones: a 13 chord that omits its 11th says so, because a player reading the
 * card wants to know what is under their fingers, not what the audit forgives.
 */
export function omittedTones(root: string, suffix: string, pitches: readonly number[]): string[] {
  const tones = chordTones(root, suffix);
  const pc = rootPc(root);
  if (!tones || pc === undefined) return [];
  const sounded = new Set(pitches.map((p) => (((p - pc) % 12) + 12) % 12));
  return tones.filter((t) => !sounded.has(t.semitones)).map((t) => (t.degree === "1" ? "root" : t.degree));
}
