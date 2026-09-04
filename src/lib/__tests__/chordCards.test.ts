import { describe, it, expect } from "vitest";
import {
  batchChordPairs,
  buildBatchGridCards,
  toVoicingCards,
  type ChordWithVoicingsLike,
} from "@/lib/chordCards";
import type { BatchToken } from "@/lib/chordBatchResolve";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

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
    expect(toVoicingCards([voicing({ label: "Standard" })])[0].label).toBe("Standard");
  });

  it("falls back to the fret position when a row has no label", () => {
    expect(toVoicingCards([voicing({ label: null, start_fret: 5 })])[0].label).toBe("Pos. 5");
  });

  it("attaches the diagram definition and the sounding pitches", () => {
    const [card] = toVoicingCards([voicing()]);
    expect(card.def.position).toBe(1);
    // Open C major, low E muted: C3 E3 G3 C4 E4.
    expect(card.pitches).toEqual([48, 52, 55, 60, 64]);
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
