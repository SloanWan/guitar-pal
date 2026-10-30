import { describe, it, expect } from "vitest";
import {
  inversionName,
  toVoicingCards,
} from "@/lib/chordCards";
import type { ChordVoicing } from "@/lib/chordVoicing";

function voicing(overrides: Partial<ChordVoicing> = {}): ChordVoicing {
  return {
    id: "v1",
    label: null,
    start_fret: 1,
    barre_fret: null,
    capo: false,
    frets: "x32010", // open C major
    fingers: "032010",
    ...overrides,
  };
}

describe("toVoicingCards", () => {
  it("carries the voicing label through", () => {
    expect(toVoicingCards([voicing({ label: "Standard" })], "C", "major")[0].label).toBe("Standard");
  });

  it("falls back to the fret position when a row has no label", () => {
    expect(toVoicingCards([voicing({ label: null, start_fret: 5 })], "C", "major")[0].label).toBe(
      "Pos. 5",
    );
  });

  it("attaches the diagram definition and the sounding pitches", () => {
    const [card] = toVoicingCards([voicing()], "C", "major");
    expect(card.def.startFret).toBe(1);
    // Open C major, low E muted: C3 E3 G3 C4 E4.
    expect(card.pitches).toEqual([48, 52, 55, 60, 64]);
  });

  it("carries the library's note through, null when there is none", () => {
    const cards = toVoicingCards(
      [voicing({ note: "Rootless: no C sounds." }), voicing({ id: "v2" })],
      "C",
      "major",
    );
    expect(cards.map((c) => c.note)).toEqual(["Rootless: no C sounds.", null]);
  });

  describe("bass (#231)", () => {
    const card = (v: ChordVoicing, root: string, suffix: string) =>
      toVoicingCards([v], root, suffix)[0];

    it("is null when the root is in the bass", () => {
      // Bm at the 9th fret, xx1342: B on the D string underneath.
      expect(
        card(voicing({ label: "Variation 3", start_fret: 9, frets: "xx1342", fingers: "001342" }), "B", "minor").bass,
      ).toBeNull();
    });

    it("names the bass of an inversion", () => {
      // Bm xx0432: the open D string under the B.
      expect(
        card(voicing({ label: "Variation 4", frets: "xx0432", fingers: "000321" }), "B", "minor").bass,
      ).toBe("D");
      // Bm 224432 (open position, low E barred along): F# under the root.
      expect(
        card(voicing({ label: "Variation 2", frets: "224432", fingers: "134111" }), "B", "minor").bass,
      ).toBe("F#");
    });

    it("never names one on a Standard — the audit keeps its root in the bass", () => {
      expect(card(voicing({ label: "Standard", frets: "224432" }), "B", "minor").bass).toBeNull();
    });

    it("says nothing under a slash chord, whose name already names the bass", () => {
      // C/G: 3x2010, G in the bass by design.
      expect(card(voicing({ label: "Variation 2", frets: "3x2010" }), "C", "/G").bass).toBeNull();
    });

    it("says nothing under a rootless shape — its note explains it instead", () => {
      // xx3524 under Bb m9 sounds F C Db Ab: no Bb anywhere, so nothing to invert.
      expect(
        card(voicing({ label: "Variation 2", start_fret: 2, frets: "xx2413" }), "Bb", "m9").bass,
      ).toBeNull();
    });

    it("spells the bass the way the root is spelled", () => {
      // Eb m69's 2x1311 has F# / Gb in the bass: flat root, flat bass.
      expect(
        card(voicing({ label: "Variation 2", frets: "2x1311", fingers: "201311" }), "Eb", "m69").bass,
      ).toBe("Gb");
      // The same pitch under a sharp root reads F#.
      expect(
        card(voicing({ label: "Variation 2", frets: "2x1311", fingers: "201311" }), "D#", "m69").bass,
      ).toBe("F#");
    });
  });
});

describe("inversionName", () => {
  it("writes the inversion in the library's slash notation", () => {
    expect(inversionName({ bass: "D" }, "B", "minor")).toBe("B minor/D");
    expect(inversionName({ bass: null }, "B", "minor")).toBeNull();
    expect(inversionName({ bass: "D" })).toBeNull();
  });
});
