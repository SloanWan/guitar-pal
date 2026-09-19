import { describe, it, expect } from "vitest";
import {
  voicingToDiagramShape,
  decodeVoicingStrings,
  selectStandardVoicing,
  type ChordVoicing,
} from "@/lib/chordVoicing";

function voicing(overrides: Partial<ChordVoicing>): ChordVoicing {
  return {
    id: "test",
    label: null,
    start_fret: 1,
    barre_fret: null,
    capo: false,
    frets: "000000",
    fingers: "000000",
    ...overrides,
  };
}

// ─── voicingToDiagramShape ────────────────────────────────────────────────────
// Ground truth: absolute frets on the neck, index 0 = low E, -1 muted, 0 open.

describe("voicingToDiagramShape — open C major", () => {
  const shape = voicingToDiagramShape(
    voicing({ start_fret: 1, barre_fret: null, capo: false, frets: "x32010", fingers: "032010" })
  );

  it("frets are on the neck, low E first, -1 for the muted string", () => {
    expect(shape.frets).toEqual([-1, 3, 2, 0, 1, 0]);
  });

  it("fingers read straight off the row", () => {
    expect(shape.fingers).toEqual([0, 3, 2, 0, 1, 0]);
  });

  it("window starts at the nut, no barre", () => {
    expect(shape.startFret).toBe(1);
    expect(shape.barreFret).toBeNull();
  });
});

describe("voicingToDiagramShape — C major barre @ fret 8 (E-shape)", () => {
  const shape = voicingToDiagramShape(
    voicing({ start_fret: 8, barre_fret: 1, capo: true, frets: "133211", fingers: "134211" })
  );

  it("relative frets become neck frets", () => {
    expect(shape.frets).toEqual([8, 10, 10, 9, 8, 8]);
  });

  it("barre fret is on the neck too", () => {
    expect(shape.barreFret).toBe(8);
    expect(shape.startFret).toBe(8);
  });

  it("fingers", () => {
    expect(shape.fingers).toEqual([1, 3, 4, 2, 1, 1]);
  });
});

describe("voicingToDiagramShape — C major partial barre @ fret 5", () => {
  const shape = voicingToDiagramShape(
    voicing({ start_fret: 5, barre_fret: 1, capo: false, frets: "xx1114", fingers: "001114" })
  );

  it("muted strings stay -1 whatever the window", () => {
    expect(shape.frets).toEqual([-1, -1, 5, 5, 5, 8]);
  });

  it("capo makes no difference to the shape: the span is the renderer's", () => {
    const capoed = voicingToDiagramShape(
      voicing({ start_fret: 5, barre_fret: 1, capo: true, frets: "xx1114", fingers: "001114" })
    );
    expect(capoed).toEqual(shape);
  });
});

describe("voicingToDiagramShape — edge cases", () => {
  it("all-open chord: every fret 0, no barre", () => {
    const shape = voicingToDiagramShape(voicing({ frets: "000000", fingers: "000000" }));
    expect(shape.frets).toEqual([0, 0, 0, 0, 0, 0]);
    expect(shape.barreFret).toBeNull();
  });

  it("an open string stays 0 whatever start_fret is", () => {
    const shape = voicingToDiagramShape(voicing({ start_fret: 5, frets: "0x1234", fingers: "001234" }));
    expect(shape.frets[0]).toBe(0);
  });

  it("null barre_fret → null barre even when capo=true", () => {
    const shape = voicingToDiagramShape(voicing({ barre_fret: null, capo: true }));
    expect(shape.barreFret).toBeNull();
  });

  it("a finger char that is not a digit reads as no finger", () => {
    const shape = voicingToDiagramShape(voicing({ frets: "300000", fingers: "?00000" }));
    expect(shape.fingers).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("always six strings", () => {
    const shape = voicingToDiagramShape(voicing({ frets: "x32010", fingers: "032010" }));
    expect(shape.frets).toHaveLength(6);
    expect(shape.fingers).toHaveLength(6);
  });

  it("is the shape the picker used to build by hand (same row, same props)", () => {
    // ChordPickerModal had its own copy of this decode; this pins the one it now shares.
    const v = voicing({ start_fret: 6, barre_fret: 1, capo: true, frets: "133111", fingers: "134111" });
    expect(voicingToDiagramShape(v)).toEqual({
      frets: [6, 8, 8, 6, 6, 6],
      fingers: [1, 3, 4, 1, 1, 1],
      startFret: 6,
      barreFret: 6,
    });
  });
});

describe("decodeVoicingStrings — open C major", () => {
  // frets="x32010", fingers="032010", start_fret=1
  const decoded = decodeVoicingStrings(
    voicing({ start_fret: 1, barre_fret: null, capo: false, frets: "x32010", fingers: "032010" })
  );

  it("returns 6 entries", () => {
    expect(decoded).toHaveLength(6);
  });

  it("string index 0 (low E) is muted", () => {
    expect(decoded[0]).toEqual({ stringIndex: 0, absoluteFret: "x", finger: 0 });
  });

  it("string index 1 (A) has absolute fret 3", () => {
    expect(decoded[1]).toEqual({ stringIndex: 1, absoluteFret: 3, finger: 3 });
  });

  it("string index 2 (D) has absolute fret 2", () => {
    expect(decoded[2]).toEqual({ stringIndex: 2, absoluteFret: 2, finger: 2 });
  });

  it("string index 3 (G) is open (absoluteFret 0)", () => {
    expect(decoded[3]).toEqual({ stringIndex: 3, absoluteFret: 0, finger: 0 });
  });

  it("string index 4 (B) has absolute fret 1", () => {
    expect(decoded[4]).toEqual({ stringIndex: 4, absoluteFret: 1, finger: 1 });
  });

  it("string index 5 (high e) is open", () => {
    expect(decoded[5]).toEqual({ stringIndex: 5, absoluteFret: 0, finger: 0 });
  });
});

describe("decodeVoicingStrings — C major barre @ fret 8 (E-shape)", () => {
  // frets="133211", start_fret=8: diagram-relative 1 → absolute 8, 3 → 10, 2 → 9
  const decoded = decodeVoicingStrings(
    voicing({ start_fret: 8, barre_fret: 1, capo: true, frets: "133211", fingers: "134211" })
  );

  it("string index 0 (low E) has absolute fret 8", () => {
    expect(decoded[0].absoluteFret).toBe(8);
  });

  it("string index 1 (A) has absolute fret 10", () => {
    expect(decoded[1].absoluteFret).toBe(10);
  });

  it("string index 3 (G) has absolute fret 9", () => {
    expect(decoded[3].absoluteFret).toBe(9);
  });
});

describe("decodeVoicingStrings — open string stays 0 regardless of start_fret", () => {
  it("start_fret=5, fret='0' → absoluteFret=0 (open, not 4)", () => {
    const decoded = decodeVoicingStrings(
      voicing({ start_fret: 5, frets: "000000", fingers: "000000" })
    );
    for (const s of decoded) {
      expect(s.absoluteFret).toBe(0);
    }
  });
});

// ─── selectStandardVoicing ────────────────────────────────────────────────────

describe("selectStandardVoicing", () => {
  it("returns null for empty array", () => {
    expect(selectStandardVoicing([])).toBeNull();
  });

  it("returns the only voicing when array has one entry", () => {
    const v = voicing({ id: "a" });
    expect(selectStandardVoicing([v])).toBe(v);
  });

  it("returns the voicing labelled 'Standard' when present", () => {
    const std = voicing({ id: "s", label: "Standard", start_fret: 7 });
    const low = voicing({ id: "l", label: null, start_fret: 1 });
    expect(selectStandardVoicing([low, std])).toBe(std);
  });

  it("prefers 'Standard' label over a lower start_fret", () => {
    const std = voicing({ id: "s", label: "Standard", start_fret: 12 });
    const open = voicing({ id: "o", label: null, start_fret: 1 });
    expect(selectStandardVoicing([open, std])).toBe(std);
  });

  it("returns lowest start_fret when no 'Standard' label exists", () => {
    const hi = voicing({ id: "h", start_fret: 9 });
    const lo = voicing({ id: "l", start_fret: 2 });
    const mid = voicing({ id: "m", start_fret: 5 });
    expect(selectStandardVoicing([hi, mid, lo])).toBe(lo);
  });

  it("returns first voicing when all share the same start_fret and none labelled Standard", () => {
    const a = voicing({ id: "a", start_fret: 3 });
    const b = voicing({ id: "b", start_fret: 3 });
    expect(selectStandardVoicing([a, b])).toBe(a);
  });
});
