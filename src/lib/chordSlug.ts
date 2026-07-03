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

// Slash-chord suffixes (/E, m/C#, …) need prefix encoding so '/' never
// appears raw in a URL path segment.
export function suffixToSlug(suffix: string): string {
  if (suffix.startsWith("m/")) {
    return "m-over-" + rootToSlug(suffix.slice(2));
  }
  if (suffix.startsWith("/")) {
    return "over-" + rootToSlug(suffix.slice(1));
  }
  return suffix.toLowerCase().replace(/#/g, "-sharp-").replace(/-$/, "");
}

export function slugToSuffix(slug: string): string {
  if (slug.startsWith("m-over-")) {
    return "m/" + slugToRoot(slug.slice(7));
  }
  if (slug.startsWith("over-")) {
    return "/" + slugToRoot(slug.slice(5));
  }
  return slug.replace(/-sharp-/g, "#").replace(/-sharp$/, "#");
}
