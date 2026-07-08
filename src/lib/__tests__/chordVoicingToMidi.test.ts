import { describe, it, expect } from "vitest";
import { chordVoicingToMidi, GUITAR_OPEN_MIDI } from "@/lib/chordVoicingToMidi";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

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

describe("GUITAR_OPEN_MIDI — open string pitches", () => {
  it("has 6 entries", () => {
    expect(GUITAR_OPEN_MIDI).toHaveLength(6);
  });

  it("index 0 (string 6, low E) = MIDI 40 (E2)", () => {
    expect(GUITAR_OPEN_MIDI[0]).toBe(40);
  });

  it("index 5 (string 1, high e) = MIDI 64 (E4)", () => {
    expect(GUITAR_OPEN_MIDI[5]).toBe(64);
  });
});

describe("chordVoicingToMidi — open C major (x32010)", () => {
  // x=muted low E, A-string fret 3=C3, D-string fret 2=E3, G open=G3, B fret 1=C4, e open=E4
  const result = chordVoicingToMidi(
    voicing({ start_fret: 1, barre_fret: null, capo: false, frets: "x32010", fingers: "032010" })
  );

  it("excludes muted strings — 5 notes for C major open shape", () => {
    expect(result).toHaveLength(5);
  });

  it("A string (index 1) at fret 3 → MIDI 48 (C3)", () => {
    const note = result.find((n) => n.stringIndex === 1);
    expect(note?.midi).toBe(48); // 45 + 3
  });

  it("D string (index 2) at fret 2 → MIDI 52 (E3)", () => {
    const note = result.find((n) => n.stringIndex === 2);
    expect(note?.midi).toBe(52); // 50 + 2
  });

  it("G string (index 3) open → MIDI 55 (G3)", () => {
    const note = result.find((n) => n.stringIndex === 3);
    expect(note?.midi).toBe(55); // 55 + 0
  });

  it("B string (index 4) at fret 1 → MIDI 60 (C4)", () => {
    const note = result.find((n) => n.stringIndex === 4);
    expect(note?.midi).toBe(60); // 59 + 1
  });

  it("high e string (index 5) open → MIDI 64 (E4)", () => {
    const note = result.find((n) => n.stringIndex === 5);
    expect(note?.midi).toBe(64); // 64 + 0
  });
});

describe("chordVoicingToMidi — C major barre @ fret 8 (E-shape)", () => {
  // frets="133211", start_fret=8: absolute frets = 8,10,10,9,8,8
  // MIDI: low E 40+8=48(C3), A 45+10=55(G3), D 50+10=60(C4), G 55+9=64(E4), B 59+8=67(G4), e 64+8=72(C5)
  const result = chordVoicingToMidi(
    voicing({ start_fret: 8, barre_fret: 1, capo: true, frets: "133211", fingers: "134211" })
  );

  it("includes all 6 strings (no muted strings in E-shape barre)", () => {
    expect(result).toHaveLength(6);
  });

  it("low E (index 0) at absolute fret 8 → MIDI 48 (C3)", () => {
    const note = result.find((n) => n.stringIndex === 0);
    expect(note?.midi).toBe(48); // 40 + 8
  });

  it("A (index 1) at absolute fret 10 → MIDI 55 (G3)", () => {
    const note = result.find((n) => n.stringIndex === 1);
    expect(note?.midi).toBe(55); // 45 + 10
  });

  it("high e (index 5) at absolute fret 8 → MIDI 72 (C5)", () => {
    const note = result.find((n) => n.stringIndex === 5);
    expect(note?.midi).toBe(72); // 64 + 8
  });
});

describe("chordVoicingToMidi — all muted strings", () => {
  it("returns empty array when all strings are muted", () => {
    const result = chordVoicingToMidi(
      voicing({ frets: "xxxxxx", fingers: "000000" })
    );
    expect(result).toHaveLength(0);
  });
});

describe("chordVoicingToMidi — all open strings", () => {
  it("returns 6 notes matching open string MIDI pitches", () => {
    const result = chordVoicingToMidi(
      voicing({ frets: "000000", fingers: "000000" })
    );
    expect(result).toHaveLength(6);
    for (const { stringIndex, midi } of result) {
      expect(midi).toBe(GUITAR_OPEN_MIDI[stringIndex]);
    }
  });
});
