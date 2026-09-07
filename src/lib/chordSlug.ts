// Bidirectional URL-slug encoding for chord root and suffix values.
// '#' is unsafe in URLs (fragment delimiter); '/' in slash-chord suffixes would
// split the URL path. Both are encoded explicitly.

import { UNKNOWN_ROOT, UNKNOWN_SUFFIX } from "@/lib/chordSuffixes";

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// '#' → '-sharp-' so both 'C#' (trailing) and 'maj7#5' (mid-suffix) encode cleanly.
// Trailing '-' is stripped after the replacement to handle the trailing-# case.
export function rootToSlug(root: string): string {
  // A chord nobody has named is stored under a root that is not a note, and '?'
  // in a path would be read as the start of the query string. It is written out
  // instead — there is no note called "unknown" for it to collide with.
  if (root === UNKNOWN_ROOT) return UNKNOWN_SUFFIX;
  return root.toLowerCase().replace(/#/g, "-sharp-").replace(/-$/, "");
}

export function slugToRoot(slug: string): string {
  if (slug === UNKNOWN_SUFFIX) return UNKNOWN_ROOT;
  // Handle '#' that was mid-string ('-sharp-') and end-of-string ('-sharp')
  return capitalizeFirst(slug.replace(/-sharp-/g, "#").replace(/-sharp$/, "#"));
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

/**
 * The page a chord is read on.
 *
 * A chord nobody has named is addressed by its shape rather than by its name:
 * every one of them is called the same thing, so the name says nothing about
 * which one is meant, while the six frets say exactly. Written with dashes so
 * the two-digit frets stay legible in a path.
 */
export function chordHref(root: string, suffix: string, shape?: string): string {
  const rootSlug = rootToSlug(root);
  if (root === UNKNOWN_ROOT && shape) {
    return `/chords/${rootSlug}/${encodeURIComponent(shape.trim().replace(/\s+/g, "-"))}`;
  }
  return `/chords/${rootSlug}/${suffixToSlug(suffix)}`;
}
