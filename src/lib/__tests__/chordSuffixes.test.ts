import { describe, it, expect } from "vitest";
import { ROOT_CHROMATIC_ORDER, sortRoots } from "@/lib/chordSuffixes";

// All 14 roots present in the chords table after C# and F# are imported.
const ALL_14_ROOTS = [
  "A", "Ab", "B", "Bb", "C", "C#", "D", "Db", "E", "Eb", "F", "F#", "G", "Gb",
];

describe("ROOT_CHROMATIC_ORDER", () => {
  it("contains exactly the 14 expected roots", () => {
    expect([...ROOT_CHROMATIC_ORDER].sort()).toEqual([...ALL_14_ROOTS].sort());
  });

  it("follows chromatic pitch order", () => {
    expect(ROOT_CHROMATIC_ORDER).toEqual([
      "C", "C#", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B",
    ]);
  });
});

describe("sortRoots", () => {
  it("returns all 14 roots in chromatic order regardless of input order", () => {
    expect(sortRoots(ALL_14_ROOTS)).toEqual([
      "C", "C#", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B",
    ]);
  });

  it("sorts a flat-only subset correctly", () => {
    // Pre-C# import state: no C# or F#
    expect(sortRoots(["A", "Ab", "B", "Bb", "C", "D", "Db", "E", "Eb", "F", "G", "Gb"])).toEqual([
      "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
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
