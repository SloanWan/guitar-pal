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

// Pure adapter — no DOM, no React deps.
// frets/fingers are 6-char strings: index 0 = string 6 (low E), index 5 = string 1 (high e).
// Fret chars are relative to start_fret (vexchords' own offset convention) — passed through as-is.
export function chordVoicingToVexChords(voicing: ChordVoicing): VexChordDef {
  const { frets, fingers, start_fret, barre_fret, capo } = voicing;

  const chord: VexChordEntry[] = [];
  for (let i = 0; i < 6; i++) {
    const stringNum = 6 - i;
    const fretChar = frets[i];
    const fingerNum = parseInt(fingers[i], 10);

    if (fretChar === "x") {
      chord.push([stringNum, "x"]);
    } else {
      const fretVal = parseInt(fretChar, 10);
      if (fingerNum > 0) {
        chord.push([stringNum, fretVal, String(fingerNum)]);
      } else {
        chord.push([stringNum, fretVal]);
      }
    }
  }

  const barres: VexBarre[] = [];
  if (barre_fret !== null) {
    if (capo) {
      barres.push({ fromString: 6, toString: 1, fret: barre_fret });
    } else {
      // Find all non-muted strings that share the barre_fret digit value
      const matchingStrings: number[] = [];
      for (let i = 0; i < 6; i++) {
        if (frets[i] !== "x" && parseInt(frets[i], 10) === barre_fret) {
          matchingStrings.push(6 - i);
        }
      }
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
