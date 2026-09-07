import { describe, it, expect } from "vitest";
import {
  ROOT_CHROMATIC_ORDER,
  UNKNOWN_ROOT,
  UNKNOWN_SUFFIX,
  chordDisplayName,
  isUnknownChord,
  isUnknownSuffix,
  unknownSuffixFor,
  sortRoots,
  isSlashChord,
  isBrowsableSuffix,
  getSuffixCategory,
  EXCLUDED_SUFFIXES,
} from "@/lib/chordSuffixes";
import { DISTINCT_SUFFIXES } from "@/lib/__fixtures__/chordData.fixture";

// All 12 roots present in the chords table (no Db/Gb — sourced spelling is C#/F#).
const ALL_12_ROOTS = [
  "A", "Ab", "B", "Bb", "C", "C#", "D", "E", "Eb", "F", "F#", "G",
];

describe("ROOT_CHROMATIC_ORDER", () => {
  it("contains exactly the 12 expected roots", () => {
    expect([...ROOT_CHROMATIC_ORDER].sort()).toEqual([...ALL_12_ROOTS].sort());
  });

  it("contains no Db or Gb entries", () => {
    expect(ROOT_CHROMATIC_ORDER).not.toContain("Db");
    expect(ROOT_CHROMATIC_ORDER).not.toContain("Gb");
  });

  it("follows chromatic pitch order", () => {
    expect(ROOT_CHROMATIC_ORDER).toEqual([
      "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
    ]);
  });
});

describe("sortRoots", () => {
  it("returns all 12 roots in chromatic order regardless of input order", () => {
    expect(sortRoots(ALL_12_ROOTS)).toEqual([
      "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
    ]);
  });

  it("preserves stability for a single root", () => {
    expect(sortRoots(["G"])).toEqual(["G"]);
  });

  it("does not mutate the input array", () => {
    const input = ["B", "A", "C"];
    sortRoots(input);
    expect(input).toEqual(["B", "A", "C"]);
  });

  it("unknown roots sort to the end", () => {
    const result = sortRoots(["X", "C", "Y"]);
    expect(result[0]).toBe("C");
    expect(result.slice(1)).toEqual(expect.arrayContaining(["X", "Y"]));
  });
});

describe("isSlashChord", () => {
  it("detects simple slash chord /E", () => expect(isSlashChord("/E")).toBe(true));
  it("detects simple slash chord m/C", () => expect(isSlashChord("m/C")).toBe(true));
  it("detects compound slash chord m9/A", () => expect(isSlashChord("m9/A")).toBe(true));
  it("detects compound slash chord m9/B", () => expect(isSlashChord("m9/B")).toBe(true));
  it("detects compound slash chord m9/E", () => expect(isSlashChord("m9/E")).toBe(true));
  it("returns false for plain suffix m9", () => expect(isSlashChord("m9")).toBe(false));
  it("returns false for plain suffix m7", () => expect(isSlashChord("m7")).toBe(false));
  it("returns false for plain suffix major", () => expect(isSlashChord("major")).toBe(false));
  it("returns false for plain suffix mmaj7", () => expect(isSlashChord("mmaj7")).toBe(false));
});

describe("suffix taxonomy invariant (no orphans)", () => {
  // The whole point of the exercise: a suffix present in the chords table that is
  // neither categorised, nor a slash chord, nor explicitly excluded is invisible in
  // both browse and search. That must fail CI here, not sit unnoticed in production.
  // NOTE: DISTINCT_SUFFIXES is a snapshot fixture — regenerate it (see
  // scripts/gen-chord-fixture.mjs) whenever chord data is imported.
  it("every suffix in the table is categorised, slash, or explicitly excluded", () => {
    const orphans = DISTINCT_SUFFIXES.filter(
      (s) =>
        getSuffixCategory(s) === null &&
        !isSlashChord(s) &&
        !EXCLUDED_SUFFIXES.includes(s),
    );
    expect(orphans).toEqual([]);
  });

  it("classifies m7b5 (half-diminished) under Diminished", () => {
    expect(getSuffixCategory("m7b5")).toBe("Diminished");
  });
});

describe("isBrowsableSuffix", () => {
  it("accepts categorised quality suffixes", () => {
    expect(isBrowsableSuffix("major")).toBe(true);
    expect(isBrowsableSuffix("m7")).toBe(true);
    expect(isBrowsableSuffix("m7b5")).toBe(true);
  });
  it("accepts slash chords", () => {
    expect(isBrowsableSuffix("/G")).toBe(true);
    expect(isBrowsableSuffix("m/C#")).toBe(true);
  });
  it("rejects excluded suffixes", () => {
    expect(isBrowsableSuffix("7sg")).toBe(false);
  });
  it("rejects unknown/uncategorised suffixes", () => {
    expect(isBrowsableSuffix("bogus")).toBe(false);
  });
});

describe("a chord nobody has named", () => {
  it("is filed under a root that is deliberately not a note", () => {
    expect(ROOT_CHROMATIC_ORDER).not.toContain(UNKNOWN_ROOT);
  });

  it("is written as the grip it is named after, never as its storage form", () => {
    expect(chordDisplayName(UNKNOWN_ROOT, "uk-007707")).toBe("uk-007707");
    expect(chordDisplayName(UNKNOWN_ROOT, UNKNOWN_SUFFIX)).toBe("unknown");
  });

  it("names a chord after the grip, spaces and case folded away", () => {
    expect(unknownSuffixFor("007707")).toBe("uk-007707");
    expect(unknownSuffixFor("X 12 12 12 10 X")).toBe("uk-x-12-12-12-10-x");
  });

  it("leaves every named chord written the way it always was", () => {
    expect(chordDisplayName("C", "major")).toBe("C major");
    expect(chordDisplayName("C", "/G")).toBe("C/G");
    expect(chordDisplayName("A", "m7")).toBe("A m7");
  });

  it("recognises the unnamed either by its root or by its quality", () => {
    expect(isUnknownChord(UNKNOWN_ROOT, "uk-007707")).toBe(true);
    expect(isUnknownSuffix("uk-007707")).toBe(true);
    expect(isUnknownSuffix(UNKNOWN_SUFFIX)).toBe(true);
    expect(isUnknownChord("C", "major")).toBe(false);
    expect(isUnknownSuffix("major")).toBe(false);
  });
});
