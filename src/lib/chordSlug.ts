// Bidirectional URL-slug encoding for chord root and suffix values.
// A note is written out — 'Ab' → 'a-flat', 'C#' → 'c-sharp' — so a flat never
// reads as a word ('ab', 'bb'). '#' is unsafe in URLs (fragment delimiter) and
// '/' in slash-chord suffixes would split the URL path; both are encoded too.

import { rootPitchClass } from "@/lib/chordVoicingToMidi";
import { ROOT_CHROMATIC_ORDER, UNKNOWN_ROOT, UNKNOWN_SUFFIX } from "@/lib/chordSuffixes";

const ACCIDENTAL_WORD: Readonly<Record<string, string>> = { "#": "-sharp", b: "-flat" };

export function rootToSlug(root: string): string {
  // A chord nobody has named is stored under a root that is not a note, and '?'
  // in a path would be read as the start of the query string. It is written out
  // instead — there is no note called "unknown" for it to collide with.
  if (root === UNKNOWN_ROOT) return UNKNOWN_SUFFIX;
  const note = /^([A-G])([#b]?)$/.exec(root);
  if (note) return note[1].toLowerCase() + (ACCIDENTAL_WORD[note[2]] ?? "");
  return root.toLowerCase().replace(/#/g, "-sharp-").replace(/-$/, "");
}

/**
 * The note a slug spells, as spelled: 'g-sharp' → 'G#', 'a-flat' → 'Ab'. The
 * old one-word flats ('ab', 'bb') are still read, so links written before the
 * notes were spelled out keep working.
 */
export function slugToRoot(slug: string): string {
  if (slug === UNKNOWN_SUFFIX) return UNKNOWN_ROOT;
  const note = /^([a-g])(-sharp|-flat|b)?$/.exec(slug);
  if (note) return note[1].toUpperCase() + (note[2] === "-sharp" ? "#" : note[2] === undefined ? "" : "b");
  // Handle '#' that was mid-string ('-sharp-') and end-of-string ('-sharp')
  const s = slug.replace(/-sharp-/g, "#").replace(/-sharp$/, "#");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A note as the library files it: one spelling per pitch, so G# and Ab are the
 * same chords. Anything that is not a note comes back as it was.
 */
export function libraryRoot(note: string): string {
  const pc = rootPitchClass(note);
  return pc === undefined ? note : ROOT_CHROMATIC_ORDER.find((r) => rootPitchClass(r) === pc) ?? note;
}

/**
 * The address a slug should be read at, or null when it already is. Only a
 * spelling the encoder would write differently moves ('ab' → 'a-flat', 'C' → 'c');
 * an enharmonic stays where it is, since 'g-sharp' and 'a-flat' are both addresses.
 */
export function canonicalSlug(slug: string, decode: (s: string) => string, encode: (v: string) => string): string | null {
  const value = decode(slug);
  const canonical = encode(value);
  return canonical !== slug && decode(canonical) === value ? canonical : null;
}

// Any suffix containing '/' (e.g. /E, m/C#, m9/A) needs encoding so '/' never
// appears raw in a URL path segment. The prefix before '/' is preserved as-is;
// the bass note after '/' is encoded with rootToSlug.
export function suffixToSlug(suffix: string): string {
  const slashIdx = suffix.indexOf("/");
  if (slashIdx !== -1) {
    const prefix = suffix.slice(0, slashIdx);
    const bassSlug = rootToSlug(suffix.slice(slashIdx + 1));
    return prefix ? `${prefix}-over-${bassSlug}` : `over-${bassSlug}`;
  }
  return suffix.toLowerCase().replace(/#/g, "-sharp-").replace(/-$/, "");
}

export function slugToSuffix(slug: string): string {
  if (slug.startsWith("over-")) {
    return "/" + slugToRoot(slug.slice(5));
  }
  const overIdx = slug.indexOf("-over-");
  if (overIdx !== -1) {
    return slug.slice(0, overIdx) + "/" + slugToRoot(slug.slice(overIdx + 6));
  }
  return slug.replace(/-sharp-/g, "#").replace(/-sharp$/, "#");
}

/** The page a chord is read on. */
export function chordHref(root: string, suffix: string): string {
  return `/chords/${rootToSlug(root)}/${suffixToSlug(suffix)}`;
}
