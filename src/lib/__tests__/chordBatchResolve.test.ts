import { describe, it, expect } from "vitest";
import {
  buildChordLookup,
  classifyBatchQuery,
  resolveChordToken,
  splitChordTokens,
  MAX_BATCH_TOKENS,
  type BatchToken,
} from "@/lib/chordBatchResolve";
import { isBrowsableSuffix } from "@/lib/chordSuffixes";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { CHORD_ROWS } from "@/lib/__fixtures__/chordData.fixture";

// Same index the server layout hands the palette: every real row minus un-browsable ones.
const INDEX: readonly ChordIndexEntry[] = CHORD_ROWS.filter((r) =>
  isBrowsableSuffix(r.suffix),
).map((r) => ({ root: r.root, suffix: r.suffix }));

const LOOKUP = buildChordLookup(INDEX);

const resolve = (token: string) => resolveChordToken(LOOKUP, token);
const classify = (raw: string) => classifyBatchQuery(LOOKUP, raw);
// Compact "root suffix" rendering of a token list, for readable assertions.
const names = (tokens: readonly BatchToken[]) =>
  tokens.map((t) => (t.status === "resolved" ? `${t.root} ${t.suffix}` : `?${t.token}`));

describe("splitChordTokens", () => {
  it("splits on whitespace, comma and pipe", () => {
    expect(splitChordTokens("C Am F G")).toEqual(["C", "Am", "F", "G"]);
    expect(splitChordTokens("C,Am,F,G")).toEqual(["C", "Am", "F", "G"]);
    expect(splitChordTokens("C|Am|F|G")).toEqual(["C", "Am", "F", "G"]);
  });

  it("tolerates mixed and repeated separators and outer padding", () => {
    expect(splitChordTokens("  C ,  Am |F   G  ")).toEqual(["C", "Am", "F", "G"]);
  });

  it("preserves duplicates — a repeated chord is meaningful in a progression", () => {
    expect(splitChordTokens("C Am C G C")).toEqual(["C", "Am", "C", "G", "C"]);
  });

  it("returns [] for empty or whitespace-only input", () => {
    expect(splitChordTokens("")).toEqual([]);
    expect(splitChordTokens("   ")).toEqual([]);
  });

  it("caps the list at MAX_BATCH_TOKENS", () => {
    const raw = Array.from({ length: MAX_BATCH_TOKENS + 5 }, () => "C").join(" ");
    expect(splitChordTokens(raw)).toHaveLength(MAX_BATCH_TOKENS);
  });
});

describe("resolveChordToken — stored spelling", () => {
  it("resolves plain triads to the major suffix", () => {
    expect(resolve("C")).toEqual({ root: "C", suffix: "major" });
    expect(resolve("Am")).toEqual({ root: "A", suffix: "minor" });
  });

  it("maps enharmonic input onto the stored spelling", () => {
    expect(resolve("Db")).toEqual({ root: "C#", suffix: "major" });
    expect(resolve("D#m")).toEqual({ root: "Eb", suffix: "minor" });
    expect(resolve("G#7")).toEqual({ root: "Ab", suffix: "7" });
  });

  it("accepts unicode accidentals", () => {
    expect(resolve("B♭maj7")).toEqual({ root: "Bb", suffix: "maj7" });
    expect(resolve("F♯m7b5")).toEqual({ root: "F#", suffix: "m7b5" });
  });

  it("accepts jazz shorthand", () => {
    expect(resolve("C-7")).toEqual({ root: "C", suffix: "m7" });
    expect(resolve("CΔ7")).toEqual({ root: "C", suffix: "maj7" });
  });

  it("resolves slash chords regardless of typed case", () => {
    expect(resolve("C/G")).toEqual({ root: "C", suffix: "/G" });
    expect(resolve("c/g")).toEqual({ root: "C", suffix: "/G" });
  });

  it("returns null for tokens that are not chord-shaped", () => {
    expect(resolve("xyz")).toBeNull();
    expect(resolve("hello")).toBeNull();
    expect(resolve("")).toBeNull();
  });

  it("rejects quality words rather than reading their leading letter as a root", () => {
    // These share the input surface with chord names — the palette also accepts them as
    // browse phrases — so batch mode must not claim them.
    expect(resolve("minor")).toBeNull(); // no root letter at all
    expect(resolve("power")).toBeNull();
    expect(resolve("dim")).toBeNull(); // would be D + "im" under a looser matcher
    expect(resolve("aug")).toBeNull(); // would be A + "ug"
    expect(resolve("all")).toBeNull(); // would be A + "ll"
    expect(resolve("chords")).toBeNull(); // would be C + "hords"
  });
});

describe("classifyBatchQuery — token resolution", () => {
  it("resolves a full progression", () => {
    const { tokens, resolvedCount, shouldOffer } = classify("C Am F G");
    expect(names(tokens)).toEqual(["C major", "A minor", "F major", "G major"]);
    expect(resolvedCount).toBe(4);
    expect(shouldOffer).toBe(true);
  });

  it("resolves mixed spellings in one query", () => {
    expect(names(classify("Db C-7 Bbmaj7").tokens)).toEqual([
      "C# major",
      "C m7",
      "Bb maj7",
    ]);
  });

  it("degrades one junk token without affecting its neighbours", () => {
    const { tokens, resolvedCount } = classify("C xyzzy G");
    expect(names(tokens)).toEqual(["C major", "?xyzzy", "G major"]);
    expect(resolvedCount).toBe(2);
  });

  it("keeps the user's original spelling on a miss, for display", () => {
    const [miss] = classify("Qq, Zz").tokens;
    expect(miss).toMatchObject({ status: "not_found", token: "Qq" });
  });

  it("gives repeated tokens distinct keys", () => {
    const keys = classify("C Am C G C").tokens.map((t) => t.key);
    expect(new Set(keys).size).toBe(5);
  });

  it("flags truncation past the cap", () => {
    expect(classify("C Am F G").truncated).toBe(false);
    const raw = Array.from({ length: MAX_BATCH_TOKENS + 1 }, () => "C").join(" ");
    const result = classify(raw);
    expect(result.truncated).toBe(true);
    expect(result.tokens).toHaveLength(MAX_BATCH_TOKENS);
  });
});

describe("classifyBatchQuery — shouldOffer gate", () => {
  it("never offers below two tokens", () => {
    expect(classify("").shouldOffer).toBe(false);
    expect(classify("C").shouldOffer).toBe(false);
    expect(classify("Cmaj7").shouldOffer).toBe(false);
  });

  it("offers when whitespace-separated tokens read convincingly as a chord list", () => {
    expect(classify("C G").shouldOffer).toBe(true);
    expect(classify("C Am F G").shouldOffer).toBe(true);
    expect(classify("C Am xyzzy F G").shouldOffer).toBe(true); // 4 hits vs 1 miss
  });

  it("leaves the browse-shortcut vocabulary alone", () => {
    // Regression guard: these multi-word queries already resolve to browse shortcuts via
    // getNavShortcut, and a token-count heuristic would have hijacked every one of them.
    expect(classify("b minor").shouldOffer).toBe(false); // 1 hit, 1 miss
    expect(classify("all b chords").shouldOffer).toBe(false); // 1 hit, 2 misses
    expect(classify("power chords").shouldOffer).toBe(false); // 0 hits
    expect(classify("b dim").shouldOffer).toBe(false); // 1 hit, 1 miss
    expect(classify("all minor chords").shouldOffer).toBe(false);
  });

  it("requires more hits than misses, not merely two hits", () => {
    expect(classify("C G xyzzy zzz").shouldOffer).toBe(false); // 2 hits, 2 misses
  });

  it("forces batch mode on an explicit comma or pipe", () => {
    // The deterministic override: these separators appear in no chord name and in no
    // browse phrase, so their presence is the user stating intent outright.
    expect(classify("b, minor").shouldOffer).toBe(true);
    expect(classify("C|G").shouldOffer).toBe(true);
    expect(classify("xyzzy, zzz").shouldOffer).toBe(true); // even with nothing resolvable
  });

  it("does not force batch mode on a trailing separator with one token", () => {
    expect(classify("C,").shouldOffer).toBe(false);
  });
});
