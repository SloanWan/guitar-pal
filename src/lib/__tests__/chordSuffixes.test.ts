import { describe, it, expect } from "vitest";
import { ROOT_CHROMATIC_ORDER, sortRoots, isSlashChord } from "@/lib/chordSuffixes";

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
