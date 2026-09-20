import { describe, it, expect } from "vitest";
import {
  FORMULAS,
  QUALITY_NAMES,
  chordSpec,
  chordTones,
  omittedTones,
  rootPc,
  spellDegree,
  withGlyphs,
} from "@/lib/chordFormulas";
import { CHORD_SUFFIX_CATEGORIES } from "@/lib/chordSuffixes";

const spelled = (root: string, suffix: string) => chordTones(root, suffix)!.map((t) => t.note).join(" ");
const degrees = (root: string, suffix: string) => chordTones(root, suffix)!.map((t) => t.degree).join(" ");

describe("the formula table", () => {
  it("has a formula and a name for every suffix the library browses", () => {
    for (const { suffixes } of CHORD_SUFFIX_CATEGORIES) {
      for (const suffix of suffixes) {
        expect(FORMULAS[suffix], suffix).toBeDefined();
        expect(QUALITY_NAMES[suffix], suffix).toBeDefined();
      }
    }
  });

  it("requires the root of every chord, and only allowed tones as must-tones", () => {
    for (const [suffix, { allowed, must }] of Object.entries(FORMULAS)) {
      expect(must.some((alts) => alts.length === 1 && alts[0] === 0), suffix).toBe(true);
      for (const alts of must) for (const t of alts) expect(allowed, suffix).toContain(t);
    }
  });
});

describe("chordSpec", () => {
  it("folds a slash chord onto its base and keeps the bass", () => {
    expect(chordSpec("/G")).toMatchObject({ baseSuffix: "major", slashBass: "G" });
    expect(chordSpec("m/G#")).toMatchObject({ baseSuffix: "minor", slashBass: "G#" });
    expect(chordSpec("m7/B")).toMatchObject({ baseSuffix: "m7", slashBass: "B" });
  });

  it("is null for a suffix the table does not know", () => {
    expect(chordSpec("7sg")).toBeNull();
    expect(chordSpec("uk-007707")).toBeNull();
  });
});

describe("rootPc and glyphs", () => {
  it("reads the tables' spellings and nothing else", () => {
    expect(rootPc("C")).toBe(0);
    expect(rootPc("C#")).toBe(1);
    expect(rootPc("Db")).toBe(1);
    expect(rootPc("Bb")).toBe(10);
    expect(rootPc("?")).toBeUndefined();
    expect(rootPc("H")).toBeUndefined();
  });

  it("turns a chord name's accidentals into glyphs", () => {
    expect(withGlyphs("Bb")).toBe("B♭");
    expect(withGlyphs("G#")).toBe("G♯");
  });
});

describe("spelling by interval (#234)", () => {
  it("stacks in thirds on the root's letter", () => {
    expect(spelled("C", "9")).toBe("C E G B♭ D");
    expect(spelled("D", "7")).toBe("D F♯ A C");
    expect(spelled("F#", "7")).toBe("F♯ A♯ C♯ E");
    expect(spelled("Eb", "m9")).toBe("E♭ G♭ B♭ D♭ F");
    expect(spelled("Bb", "maj7")).toBe("B♭ D F A");
  });

  it("folds E♯ B♯ C♭ F♭ to the names a chart prints", () => {
    expect(spelled("C#", "maj7")).toBe("C♯ F G♯ C");
    expect(spelled("Gb", "major")).toBe("G♭ B♭ D♭");
    expect(spellDegree("F", 4, 2)).toBe("A");
    expect(spellDegree("Cb", 0, 0)).toBe("B");
  });

  it("falls back to a plain enharmonic rather than a double accidental", () => {
    // E♭dim7: the ♭5 would be B♭♭, the ♭♭7 D♭♭.
    expect(spelled("Eb", "dim7")).toBe("E♭ G♭ A C");
  });

  it("names the degree by what the chord is, not by the semitone alone", () => {
    expect(degrees("C", "7b5")).toBe("1 3 ♭5 ♭7");
    expect(degrees("C", "9#11")).toBe("1 3 5 ♭7 9 ♯11");
    expect(degrees("C", "7#9")).toBe("1 3 5 ♭7 ♯9");
    expect(degrees("C", "sus4")).toBe("1 4 5");
    expect(degrees("C", "sus2")).toBe("1 2 5");
    expect(degrees("C", "add11")).toBe("1 3 5 11");
    expect(degrees("C", "6")).toBe("1 3 5 6");
    expect(degrees("C", "13")).toBe("1 3 5 ♭7 9 11 13");
    expect(degrees("C", "aug")).toBe("1 3 ♯5");
    expect(degrees("C", "dim7")).toBe("1 ♭3 ♭5 ♭♭7");
    expect(degrees("C", "alt")).toBe("1 3 ♭5");
  });

  it("reads a slash chord's tones from its base and spells the ♯9 as a ninth", () => {
    expect(spelled("A", "m/G#")).toBe("A C E");
    expect(spelled("C", "7#9")).toBe("C E G B♭ D♯");
  });

  it("is null where there is nothing to spell", () => {
    expect(chordTones("C", "7sg")).toBeNull();
    expect(chordTones("?", "uk-007707")).toBeNull();
  });
});

describe("omittedTones", () => {
  it("lists the allowed tones a voicing does not sound", () => {
    // C9 at the 9th fret, xx2132: C E B♭ D — no fifth.
    expect(omittedTones("C", "9", [60, 64, 70, 74])).toEqual(["5"]);
    // C13 without its 11th and 5th, as almost every 13 shape is.
    expect(omittedTones("C", "13", [48, 52, 58, 62, 69])).toEqual(["5", "11"]);
  });

  it("says 'root' for a rootless comping shape", () => {
    // B♭m9's xx2413 at the 2nd fret sounds F C D♭ A♭.
    expect(omittedTones("Bb", "m9", [53, 60, 61, 68])).toEqual(["root"]);
  });

  it("is empty when everything sounds, or when there is no formula", () => {
    expect(omittedTones("C", "major", [48, 52, 55, 60, 64])).toEqual([]);
    expect(omittedTones("C", "7sg", [48, 52, 55])).toEqual([]);
  });
});
