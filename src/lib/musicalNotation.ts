// Display-only formatting helpers for musical text.
// Not for use in URL slugs (see chordSlug.ts) or <title>/<meta> tags.
// Safe as a global replace for this dataset: no root or suffix value uses
// lowercase 'b' or '#' for any purpose other than flat/sharp notation.

export type MusicalTextSegment =
  | { type: "text"; value: string }
  | { type: "symbol"; value: "♭" | "♯" };

// Pure parser — no JSX/DOM dependency.
export function parseMusicalText(text: string): MusicalTextSegment[] {
  const segments: MusicalTextSegment[] = [];
  let buf = "";
  for (const char of text) {
    if (char === "b") {
      if (buf) { segments.push({ type: "text", value: buf }); buf = ""; }
      segments.push({ type: "symbol", value: "♭" });
    } else if (char === "#") {
      if (buf) { segments.push({ type: "text", value: buf }); buf = ""; }
      segments.push({ type: "symbol", value: "♯" });
    } else {
      buf += char;
    }
  }
  if (buf) segments.push({ type: "text", value: buf });
  return segments;
}
