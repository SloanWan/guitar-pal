export interface ChordVoicing {
  id: string;
  label: string | null;
  start_fret: number;
  barre_fret: number | null;
  capo: boolean;
  frets: string;
  fingers: string;
  /**
   * One line the library says under this shape — "Rootless: …", "Hand-written
   * …" (#230). Only the chord page reads it, so only `chordsData` selects it;
   * a player's own shape and the strum/fingerpick caches never carry one.
   */
  note?: string | null;
}

/**
 * A shape as the diagram draws it — the data half of `ChordDiagramSVG`'s props,
 * and what `ChordShapeStrip` takes. Six entries each, index 0 = string 6 (low E).
 * Frets are on the neck: -1 muted, 0 open. `barreFret` is on the neck too, or
 * null; which strings the bar spans is the renderer's call, from the strings
 * sharing the barre finger. (The editor's `ChordShape` in `chordShape.ts` is the
 * same idea with "x" for a muted string, because there a string is typed into.)
 */
export interface DiagramShape {
  frets: number[];
  fingers: number[];
  startFret: number;
  barreFret: number | null;
}

/**
 * Per-string decoded data with absolute guitar fret numbers.
 * stringIndex 0 = string 6 (low E), stringIndex 5 = string 1 (high e).
 * absoluteFret 0 = open string; positive = actual fret on the guitar neck; "x" = muted.
 * DB frets chars are diagram-relative (offset within the diagram starting at start_fret),
 * so absolute = start_fret - 1 + relFret for non-zero frets.
 */
export interface DecodedString {
  stringIndex: number;
  absoluteFret: number | "x";
  finger: number;
}

// Pure adapter — no DOM, no React deps.
// frets/fingers are 6-char strings: index 0 = string 6 (low E), index 5 = string 1 (high e).
// Fret chars are diagram-relative: 0 is open, otherwise absolute = start_fret - 1 + rel.
export function decodeVoicingStrings(voicing: ChordVoicing): DecodedString[] {
  const { frets, fingers, start_fret } = voicing;
  return Array.from({ length: 6 }, (_, i) => {
    const fretChar = frets[i];
    const finger = parseInt(fingers[i], 10);
    if (fretChar === "x") return { stringIndex: i, absoluteFret: "x" as const, finger };
    const relFret = parseInt(fretChar, 10);
    const absoluteFret = relFret === 0 ? 0 : start_fret - 1 + relFret;
    return { stringIndex: i, absoluteFret, finger };
  });
}

export function voicingToDiagramShape(voicing: ChordVoicing): DiagramShape {
  const { start_fret, barre_fret } = voicing;
  const decoded = decodeVoicingStrings(voicing);
  return {
    frets: decoded.map(({ absoluteFret }) => (absoluteFret === "x" ? -1 : absoluteFret)),
    // A finger char that is not a digit reads as "no finger", never as NaN on the diagram.
    fingers: decoded.map(({ finger }) => (finger > 0 ? finger : 0)),
    startFret: start_fret,
    barreFret: barre_fret === null ? null : start_fret - 1 + barre_fret,
  };
}

export { selectStandardVoicing } from "@/lib/selectStandardVoicing";
