export interface ChordVoicing {
  id: string;
  label: string | null;
  start_fret: number;
  barre_fret: number | null;
  capo: boolean;
  frets: string;
  fingers: string;
}

// [string, fret] or [string, fret, fingerLabel]
// string 1 = high e, string 6 = low E (vexchords convention)
type VexChordEntry =
  | [number, number | "x"]
  | [number, number | "x", string];

export interface VexBarre {
  fromString: number;
  toString: number;
  fret: number;
}

export interface VexChordDef {
  chord: VexChordEntry[];
  position: number;
  barres: VexBarre[];
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
// Fret chars are diagram-relative (vexchords' position offset convention).
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

export function chordVoicingToVexChords(voicing: ChordVoicing): VexChordDef {
  const { start_fret, barre_fret, capo } = voicing;
  const decoded = decodeVoicingStrings(voicing);

  const chord: VexChordEntry[] = decoded.map(({ stringIndex, absoluteFret, finger }) => {
    const stringNum = 6 - stringIndex;
    if (absoluteFret === "x") return [stringNum, "x"];
    // Convert absolute fret back to diagram-relative for VexChords
    const diagramFret = absoluteFret === 0 ? 0 : absoluteFret - start_fret + 1;
    if (finger > 0) return [stringNum, diagramFret, String(finger)];
    return [stringNum, diagramFret];
  });

  const barres: VexBarre[] = [];
  if (barre_fret !== null) {
    if (capo) {
      barres.push({ fromString: 6, toString: 1, fret: barre_fret });
    } else {
      const absBarreFret = start_fret - 1 + barre_fret;
      const matchingStrings = decoded
        .filter(({ absoluteFret }) => absoluteFret !== "x" && absoluteFret === absBarreFret)
        .map(({ stringIndex }) => 6 - stringIndex);
      if (matchingStrings.length > 0) {
        barres.push({
          fromString: Math.max(...matchingStrings),
          toString: Math.min(...matchingStrings),
          fret: barre_fret,
        });
      }
    }
  }

  return { chord, position: start_fret, barres };
}

// Returns the voicing labelled "Standard", or the voicing with the lowest start_fret
// when no "Standard" label exists. Returns null for an empty array.
export function selectStandardVoicing(voicings: ChordVoicing[]): ChordVoicing | null {
  if (voicings.length === 0) return null;
  const standard = voicings.find((v) => v.label === "Standard");
  if (standard) return standard;
  return voicings.reduce((min, v) => (v.start_fret < min.start_fret ? v : min));
}
