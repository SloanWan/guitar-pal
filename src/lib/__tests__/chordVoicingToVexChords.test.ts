import { describe, it, expect } from "vitest";
import {
  chordVoicingToVexChords,
  type ChordVoicing,
} from "@/lib/chordVoicingToVexChords";

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

// ─── Ground-truth test cases ──────────────────────────────────────────────────

describe("chordVoicingToVexChords — open C major", () => {
  // frets="x32010", fingers="032010", start_fret=1, barre_fret=null, capo=false
  const result = chordVoicingToVexChords(
    voicing({ start_fret: 1, barre_fret: null, capo: false, frets: "x32010", fingers: "032010" })
  );

  it("position = start_fret", () => {
    expect(result.position).toBe(1);
  });

  it("no barres", () => {
    expect(result.barres).toHaveLength(0);
  });

  it("string 6 is muted", () => {
    expect(result.chord[0]).toEqual([6, "x"]);
  });

  it("string 5 has fret 3 with finger 3", () => {
    expect(result.chord[1]).toEqual([5, 3, "3"]);
  });

  it("string 4 has fret 2 with finger 2", () => {
    expect(result.chord[2]).toEqual([4, 2, "2"]);
  });

  it("string 3 is open with no finger label", () => {
    expect(result.chord[3]).toEqual([3, 0]);
  });

  it("string 2 has fret 1 with finger 1", () => {
    expect(result.chord[4]).toEqual([2, 1, "1"]);
  });

  it("string 1 is open with no finger label", () => {
    expect(result.chord[5]).toEqual([1, 0]);
  });
});

describe("chordVoicingToVexChords — C major barre @ fret 8 (full capo, E-shape)", () => {
  // frets="133211", fingers="134211", start_fret=8, barre_fret=1, capo=true
  const result = chordVoicingToVexChords(
    voicing({ start_fret: 8, barre_fret: 1, capo: true, frets: "133211", fingers: "134211" })
  );

  it("position = 8", () => {
    expect(result.position).toBe(8);
  });

  it("one full-width barre at fret 1", () => {
    expect(result.barres).toHaveLength(1);
    expect(result.barres[0]).toEqual({ fromString: 6, toString: 1, fret: 1 });
  });

  it("string 6 has fret 1 with finger 1", () => {
    expect(result.chord[0]).toEqual([6, 1, "1"]);
  });

  it("string 5 has fret 3 with finger 3", () => {
    expect(result.chord[1]).toEqual([5, 3, "3"]);
  });

  it("string 4 has fret 3 with finger 4", () => {
    expect(result.chord[2]).toEqual([4, 3, "4"]);
  });

  it("string 3 has fret 2 with finger 2", () => {
    expect(result.chord[3]).toEqual([3, 2, "2"]);
  });

  it("string 2 has fret 1 with finger 1", () => {
    expect(result.chord[4]).toEqual([2, 1, "1"]);
  });

  it("string 1 has fret 1 with finger 1", () => {
    expect(result.chord[5]).toEqual([1, 1, "1"]);
  });
});

describe("chordVoicingToVexChords — C major partial barre @ fret 5", () => {
  // frets="xx1114", fingers="001114", start_fret=5, barre_fret=1, capo=false
  const result = chordVoicingToVexChords(
    voicing({ start_fret: 5, barre_fret: 1, capo: false, frets: "xx1114", fingers: "001114" })
  );

  it("position = 5", () => {
    expect(result.position).toBe(5);
  });

  it("one partial barre spanning strings 4 to 2", () => {
    expect(result.barres).toHaveLength(1);
    expect(result.barres[0]).toEqual({ fromString: 4, toString: 2, fret: 1 });
  });

  it("string 6 is muted", () => {
    expect(result.chord[0]).toEqual([6, "x"]);
  });

  it("string 5 is muted", () => {
    expect(result.chord[1]).toEqual([5, "x"]);
  });

  it("string 4 has fret 1 with finger 1", () => {
    expect(result.chord[2]).toEqual([4, 1, "1"]);
  });

  it("string 3 has fret 1 with finger 1", () => {
    expect(result.chord[3]).toEqual([3, 1, "1"]);
  });

  it("string 2 has fret 1 with finger 1", () => {
    expect(result.chord[4]).toEqual([2, 1, "1"]);
  });

  it("string 1 has fret 4 with finger 4", () => {
    expect(result.chord[5]).toEqual([1, 4, "4"]);
  });
});

// ─── Additional edge cases ─────────────────────────────────────────────────────

describe("chordVoicingToVexChords — edge cases", () => {
  it("all-open chord produces no barres and all fret 0 entries", () => {
    const result = chordVoicingToVexChords(
      voicing({ frets: "000000", fingers: "000000" })
    );
    expect(result.barres).toHaveLength(0);
    for (const entry of result.chord) {
      expect(entry[1]).toBe(0);
    }
  });

  it("null barre_fret → no barres even when capo=true", () => {
    const result = chordVoicingToVexChords(
      voicing({ barre_fret: null, capo: true })
    );
    expect(result.barres).toHaveLength(0);
  });

  it("finger 0 on a fretted string emits no label", () => {
    const result = chordVoicingToVexChords(
      voicing({ frets: "300000", fingers: "000000" })
    );
    // string 6, fret 3, no label
    expect(result.chord[0]).toHaveLength(2);
    expect(result.chord[0][1]).toBe(3);
  });

  it("produces exactly 6 chord entries", () => {
    const result = chordVoicingToVexChords(voicing({}));
    expect(result.chord).toHaveLength(6);
  });
});
