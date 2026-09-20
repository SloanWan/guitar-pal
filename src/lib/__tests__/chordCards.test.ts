import { describe, it, expect } from "vitest";
import {
  batchChordPairs,
  buildBatchGridCards,
  inversionName,
  toVoicingCards,
  type ChordWithVoicingsLike,
} from "@/lib/chordCards";
import type { BatchToken } from "@/lib/chordBatchResolve";
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

function chord(
  root: string,
  suffix: string,
  voicings: ChordVoicing[] = [voicing({ label: "Standard" })],
): ChordWithVoicingsLike {
  return { root, suffix, chord_voicings: voicings };
}

const hit = (key: string, token: string, root: string, suffix: string): BatchToken => ({
  key,
  token,
  status: "resolved",
  root,
  suffix,
});
const miss = (key: string, token: string): BatchToken => ({ key, token, status: "not_found" });

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

describe("batchChordPairs", () => {
  it("collects the resolved pairs in order", () => {
    const pairs = batchChordPairs([
      hit("0-C", "C", "C", "major"),
      hit("1-Am", "Am", "A", "minor"),
    ]);
    expect(pairs).toEqual([
      { root: "C", suffix: "major" },
      { root: "A", suffix: "minor" },
    ]);
  });

  it("de-duplicates a chord that repeats in the progression", () => {
    const pairs = batchChordPairs([
      hit("0-C", "C", "C", "major"),
      hit("1-G", "G", "G", "major"),
      hit("2-C", "C", "C", "major"),
    ]);
    expect(pairs).toHaveLength(2);
  });

  it("ignores tokens that never resolved", () => {
    expect(batchChordPairs([miss("0-xyzzy", "xyzzy")])).toEqual([]);
  });
});

describe("buildBatchGridCards", () => {
  const tokens = [
    hit("0-Db", "Db", "C#", "major"),
    miss("1-xyzzy", "xyzzy"),
    hit("2-C", "C", "C", "major"),
  ];
  const chords = [chord("C#", "major"), chord("C", "major")];

  it("keeps the query's order, mapping each token to its own card", () => {
    const cards = buildBatchGridCards(tokens, chords);
    expect(cards.map((c) => c.status)).toEqual(["resolved", "not_found", "resolved"]);
    expect(cards.map((c) => c.key)).toEqual(["0-Db", "1-xyzzy", "2-C"]);
  });

  it("labels a hit with the stored spelling, not the typed one", () => {
    const [card] = buildBatchGridCards(tokens, chords);
    expect(card).toMatchObject({ status: "resolved", token: "Db", label: "C# major" });
  });

  it("renders a slash chord label without an inserted space", () => {
    const [card] = buildBatchGridCards(
      [hit("0-C/G", "C/G", "C", "/G")],
      [chord("C", "/G")],
    );
    expect(card).toMatchObject({ label: "C/G" });
  });

  it("keeps the user's spelling on a miss, for the not-found card", () => {
    expect(buildBatchGridCards(tokens, chords)[1]).toEqual({
      key: "1-xyzzy",
      status: "not_found",
      token: "xyzzy",
    });
  });

  it("repeats a card for a chord that repeats, without repeating the fetch", () => {
    const repeated = [hit("0-C", "C", "C", "major"), hit("1-C", "C", "C", "major")];
    const cards = buildBatchGridCards(repeated, [chord("C", "major")]);
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.status === "resolved")).toBe(true);
    expect(new Set(cards.map((c) => c.key)).size).toBe(2);
  });

  it("points standardIndex at the Standard voicing, wherever it sits in the row order", () => {
    const card = buildBatchGridCards(
      [hit("0-C", "C", "C", "major")],
      [
        chord("C", "major", [
          voicing({ id: "a", label: "Pos. 3", start_fret: 3 }),
          voicing({ id: "b", label: "Standard" }),
        ]),
      ],
    )[0];
    expect(card).toMatchObject({ status: "resolved", standardIndex: 1 });
  });

  it("degrades to a not-found card when the index and the voicing tables disagree", () => {
    // Resolved against the search index, but no chord row came back.
    expect(buildBatchGridCards([hit("0-C", "C", "C", "major")], [])[0].status).toBe("not_found");
    // Chord row exists but carries no voicings at all.
    expect(
      buildBatchGridCards([hit("0-C", "C", "C", "major")], [chord("C", "major", [])])[0].status,
    ).toBe("not_found");
  });
});
