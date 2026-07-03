import { describe, it, expect } from "vitest";
import { rootToSlug, slugToRoot, suffixToSlug, slugToSuffix } from "@/lib/chordSlug";

// All 14 root values present in the chords table (12 chromatic + enharmonics)
const ALL_ROOTS = [
  "A", "Ab", "B", "Bb", "C", "C#", "D", "Db", "E", "Eb", "F", "F#", "G", "Gb",
];

// All 39 taxonomy suffixes from CHORD_SUFFIX_CATEGORIES
const TAXONOMY_SUFFIXES = [
  // Major
  "major", "6", "69", "add9", "maj7", "maj9", "maj11", "maj13", "maj7#5", "maj7b5",
  // Minor
  "minor", "m6", "m69", "madd9", "m7", "m9", "m11", "mmaj7", "mmaj9", "mmaj11", "mmaj7b5",
  // Dominant 7th
  "7", "9", "11", "13", "7#9", "7b5", "7b9", "9#11", "9b5", "alt",
  // Suspended
  "sus2", "sus4", "7sus4",
  // Diminished
  "dim", "dim7",
  // Augmented
  "aug", "aug7", "aug9",
];

// Excluded suffix
const EXCLUDED_SUFFIXES = ["7sg"];

// Slash chords over all 14 roots (major and minor variants)
const SLASH_MAJOR = ALL_ROOTS.map((r) => `/${r}`);
const SLASH_MINOR = ALL_ROOTS.map((r) => `m/${r}`);

// ─── Root round-trip ─────────────────────────────────────────────────────────

describe("root slug round-trip", () => {
  for (const root of ALL_ROOTS) {
    it(`${root} → slug → ${root}`, () => {
      expect(slugToRoot(rootToSlug(root))).toBe(root);
    });
  }
});

// ─── Root known slugs ────────────────────────────────────────────────────────

describe("rootToSlug known values", () => {
  it("A → a", () => expect(rootToSlug("A")).toBe("a"));
  it("Ab → ab", () => expect(rootToSlug("Ab")).toBe("ab"));
  it("C# → c-sharp", () => expect(rootToSlug("C#")).toBe("c-sharp"));
  it("F# → f-sharp", () => expect(rootToSlug("F#")).toBe("f-sharp"));
  it("Bb → bb", () => expect(rootToSlug("Bb")).toBe("bb"));
  it("Db → db", () => expect(rootToSlug("Db")).toBe("db"));
});

// ─── Suffix round-trip (taxonomy) ────────────────────────────────────────────

describe("taxonomy suffix slug round-trip", () => {
  for (const s of TAXONOMY_SUFFIXES) {
    it(`${s} → slug → ${s}`, () => {
      expect(slugToSuffix(suffixToSlug(s))).toBe(s);
    });
  }
});

// ─── Suffix round-trip (excluded) ────────────────────────────────────────────

describe("excluded suffix slug round-trip", () => {
  for (const s of EXCLUDED_SUFFIXES) {
    it(`${s} → slug → ${s}`, () => {
      expect(slugToSuffix(suffixToSlug(s))).toBe(s);
    });
  }
});

// ─── Slash chord suffix round-trip ───────────────────────────────────────────

describe("slash chord (major) suffix slug round-trip", () => {
  for (const s of SLASH_MAJOR) {
    it(`${s} → slug → ${s}`, () => {
      expect(slugToSuffix(suffixToSlug(s))).toBe(s);
    });
  }
});

describe("slash chord (minor) suffix slug round-trip", () => {
  for (const s of SLASH_MINOR) {
    it(`${s} → slug → ${s}`, () => {
      expect(slugToSuffix(suffixToSlug(s))).toBe(s);
    });
  }
});

// ─── Suffix known slugs ──────────────────────────────────────────────────────

describe("suffixToSlug known values", () => {
  it("major → major", () => expect(suffixToSlug("major")).toBe("major"));
  it("maj7#5 → maj7-sharp-5", () => expect(suffixToSlug("maj7#5")).toBe("maj7-sharp-5"));
  it("7#9 → 7-sharp-9", () => expect(suffixToSlug("7#9")).toBe("7-sharp-9"));
  it("9#11 → 9-sharp-11", () => expect(suffixToSlug("9#11")).toBe("9-sharp-11"));
  it("/E → over-e", () => expect(suffixToSlug("/E")).toBe("over-e"));
  it("/C# → over-c-sharp", () => expect(suffixToSlug("/C#")).toBe("over-c-sharp"));
  it("m/C → m-over-c", () => expect(suffixToSlug("m/C")).toBe("m-over-c"));
  it("m/C# → m-over-c-sharp", () => expect(suffixToSlug("m/C#")).toBe("m-over-c-sharp"));
  it("m/Bb → m-over-bb", () => expect(suffixToSlug("m/Bb")).toBe("m-over-bb"));
  // Plain suffixes starting with 'm' are NOT slash chords
  it("m7 → m7 (not treated as slash chord)", () => expect(suffixToSlug("m7")).toBe("m7"));
  it("mmaj7 → mmaj7 (not treated as slash chord)", () => expect(suffixToSlug("mmaj7")).toBe("mmaj7"));
});

describe("slugToSuffix known values", () => {
  it("major → major", () => expect(slugToSuffix("major")).toBe("major"));
  it("maj7-sharp-5 → maj7#5", () => expect(slugToSuffix("maj7-sharp-5")).toBe("maj7#5"));
  it("7-sharp-9 → 7#9", () => expect(slugToSuffix("7-sharp-9")).toBe("7#9"));
  it("over-e → /E", () => expect(slugToSuffix("over-e")).toBe("/E"));
  it("m-over-c → m/C", () => expect(slugToSuffix("m-over-c")).toBe("m/C"));
  it("m-over-c-sharp → m/C#", () => expect(slugToSuffix("m-over-c-sharp")).toBe("m/C#"));
  it("m7 → m7 (not decoded as slash chord)", () => expect(slugToSuffix("m7")).toBe("m7"));
  it("mmaj7 → mmaj7 (not decoded as slash chord)", () => expect(slugToSuffix("mmaj7")).toBe("mmaj7"));
});
