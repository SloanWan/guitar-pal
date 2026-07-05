// Bidirectional URL-slug encoding for chord root and suffix values.
// '#' is unsafe in URLs (fragment delimiter); '/' in slash-chord suffixes would
// split the URL path. Both are encoded explicitly.

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// '#' → '-sharp-' so both 'C#' (trailing) and 'maj7#5' (mid-suffix) encode cleanly.
// Trailing '-' is stripped after the replacement to handle the trailing-# case.
export function rootToSlug(root: string): string {
  return root.toLowerCase().replace(/#/g, "-sharp-").replace(/-$/, "");
}

export function slugToRoot(slug: string): string {
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
