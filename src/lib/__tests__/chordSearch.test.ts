import { describe, it, expect } from "vitest";
import {
  parseQuery,
  searchChords,
  getNavShortcut,
  normalizeChordName,
  type ChordIndexEntry,
} from "@/lib/chordSearch";
import { isBrowsableSuffix, CHORD_SUFFIX_CATEGORIES } from "@/lib/chordSuffixes";
import { rootToSlug, suffixToSlug, slugToRoot, slugToSuffix } from "@/lib/chordSlug";
import { CHORD_ROWS } from "@/lib/__fixtures__/chordData.fixture";

// Realistic index: exactly what the server layout would hand <ChordSearch> —
// every table row minus the un-browsable ones (7sg).
const INDEX: readonly ChordIndexEntry[] = CHORD_ROWS.filter((r) =>
  isBrowsableSuffix(r.suffix),
).map((r) => ({ root: r.root, suffix: r.suffix }));

const top = (q: string) => searchChords(INDEX, q)[0];

describe("parseQuery — root parsing & enharmonics", () => {
  it("maps flats onto the stored sharp/flat spelling", () => {
    expect(parseQuery("Db").root).toBe("C#");
    expect(parseQuery("Gb").root).toBe("F#");
  });

  it("maps sharps that are stored as flats", () => {
    expect(parseQuery("D#").root).toBe("Eb");
    expect(parseQuery("G#").root).toBe("Ab");
    expect(parseQuery("A#").root).toBe("Bb");
  });

  it("passes through roots already in stored spelling", () => {
    expect(parseQuery("C#").root).toBe("C#");
    expect(parseQuery("Eb").root).toBe("Eb");
    expect(parseQuery("B").root).toBe("B");
    expect(parseQuery("Bb").root).toBe("Bb");
  });

  it("handles unicode accidentals ♯ / ♭", () => {
    expect(parseQuery("C♯").root).toBe("C#");
    expect(parseQuery("B♭").root).toBe("Bb");
    expect(parseQuery("D♭").root).toBe("C#");
  });

  it("handles rare enharmonics Cb/Fb/E#/B#", () => {
    expect(parseQuery("Cb").root).toBe("B");
    expect(parseQuery("Fb").root).toBe("E");
    expect(parseQuery("E#").root).toBe("F");
    expect(parseQuery("B#").root).toBe("C");
  });
});

describe("parseQuery — suffix normalization", () => {
  it("empty suffix means major", () => {
    expect(parseQuery("C").normalizedSuffix).toBe("major");
    expect(parseQuery("C").suffixQuery).toBe("");
  });

  it("m / min / minor and leading '-' all mean minor", () => {
    expect(parseQuery("Cm").normalizedSuffix).toBe("minor");
    expect(parseQuery("Cmin").normalizedSuffix).toBe("minor");
    expect(parseQuery("Cminor").normalizedSuffix).toBe("minor");
    expect(parseQuery("C-").normalizedSuffix).toBe("minor");
  });

  it("leading '-' before a number is minor-N (C-7 = Cm7)", () => {
    expect(parseQuery("C-7").normalizedSuffix).toBe("m7");
  });

  it("Δ and Δ7 mean maj7", () => {
    expect(parseQuery("CΔ").normalizedSuffix).toBe("maj7");
    expect(parseQuery("CΔ7").normalizedSuffix).toBe("maj7");
  });

  it("collapses case and whitespace", () => {
    const p = parseQuery("  c MAJ 7  ");
    expect(p.root).toBe("C");
    expect(p.normalizedSuffix).toBe("maj7");
  });
});

describe("searchChords — mandated cases", () => {
  it("Db (enharmonic) → C# major on top", () => {
    expect(top("Db")).toMatchObject({ root: "C#", suffix: "major" });
  });

  it('"  c MAJ 7  " (case + whitespace) → C maj7 on top', () => {
    expect(top("  c MAJ 7  ")).toMatchObject({ root: "C", suffix: "maj7" });
  });

  it("unicode C♯ / B♭ / Δ resolve to real chords", () => {
    expect(top("C♯")).toMatchObject({ root: "C#", suffix: "major" });
    expect(top("B♭")).toMatchObject({ root: "Bb", suffix: "major" });
    expect(top("CΔ7")).toMatchObject({ root: "C", suffix: "maj7" });
  });

  it("C7sg (excluded) never surfaces the 7sg suffix", () => {
    const results = searchChords(INDEX, "C7sg");
    expect(results.every((r) => r.suffix !== "7sg")).toBe(true);
  });

  it("C/G (slash chord) → C /G, slugging to over-g", () => {
    const r = top("C/G");
    expect(r).toMatchObject({ root: "C", suffix: "/G", category: "Slash Chords" });
    expect(suffixToSlug(r.suffix)).toBe("over-g");
  });
});

describe("searchChords — everyday queries", () => {
  it("am → A minor", () => {
    expect(top("am")).toMatchObject({ root: "A", suffix: "minor" });
  });

  it("f#m7b5 → F# m7b5 (half-diminished, now categorised)", () => {
    expect(top("f#m7b5")).toMatchObject({ root: "F#", suffix: "m7b5", category: "Diminished" });
  });

  it("bare root lists major first", () => {
    expect(top("C").suffix).toBe("major");
  });

  it("prefix autocomplete: 'cmaj' surfaces maj-family, maj7 present", () => {
    const results = searchChords(INDEX, "Cmaj");
    expect(results.some((r) => r.root === "C" && r.suffix === "maj7")).toBe(true);
  });

  it("tolerates a single-edit typo (cmajr7 → C maj7)", () => {
    expect(top("cmajr7")).toMatchObject({ root: "C", suffix: "maj7" });
  });

  it("empty / whitespace input returns nothing", () => {
    expect(searchChords(INDEX, "")).toEqual([]);
    expect(searchChords(INDEX, "   ")).toEqual([]);
  });

  it("all results come from the browsable index (never 7sg)", () => {
    for (const r of searchChords(INDEX, "C", 100)) {
      expect(isBrowsableSuffix(r.suffix)).toBe(true);
    }
  });
});

describe("getNavShortcut — browse jump shortcuts", () => {
	it("a bare root resolves to a root shortcut (stored spelling)", () => {
		expect(getNavShortcut("B")).toEqual({ kind: "root", root: "B" });
		expect(getNavShortcut("Db")).toEqual({ kind: "root", root: "C#" });
		expect(getNavShortcut("bb")).toEqual({ kind: "root", root: "Bb" });
	});

	it("a root persists even with a suffix typed after it", () => {
		expect(getNavShortcut("Bmaj7")).toEqual({ kind: "root", root: "B" });
		expect(getNavShortcut("c#m7")).toEqual({ kind: "root", root: "C#" });
	});

	it("reads free-form input token-by-token, ignoring filler words", () => {
		// Regression: "all b chords" used to parse the leading 'a' of "all" as root A.
		expect(getNavShortcut("all b chords")).toEqual({ kind: "root", root: "B" });
		expect(getNavShortcut("all chords")).toBeNull();
		expect(getNavShortcut("chords")).toBeNull();
	});

	it("a root + a quality resolves to a combined root-category shortcut", () => {
		expect(getNavShortcut("b minor")).toEqual({ kind: "root-category", root: "B", category: "Minor" });
		// Order-independent, and a fused single token splits too.
		expect(getNavShortcut("minor b")).toEqual({ kind: "root-category", root: "B", category: "Minor" });
		expect(getNavShortcut("bminor")).toEqual({ kind: "root-category", root: "B", category: "Minor" });
		// Enharmonic root normalises inside the combined shortcut.
		expect(getNavShortcut("db diminished")).toEqual({ kind: "root-category", root: "C#", category: "Diminished" });
	});

	it("a quality word (and its 3+ char prefix) resolves to a category shortcut", () => {
		expect(getNavShortcut("minor")).toEqual({ kind: "category", category: "Minor" });
		expect(getNavShortcut("min")).toEqual({ kind: "category", category: "Minor" });
		expect(getNavShortcut("suspended")).toEqual({ kind: "category", category: "Suspended" });
		expect(getNavShortcut("dom")).toEqual({ kind: "category", category: "Dominant 7th" });
		expect(getNavShortcut("power")).toEqual({ kind: "category", category: "Power Chord" });
	});

	it("a quality word wins over its incidental root parse", () => {
		// "dim"/"aug" start with root letters d/a but mean the category.
		expect(getNavShortcut("dim")).toEqual({ kind: "category", category: "Diminished" });
		expect(getNavShortcut("aug")).toEqual({ kind: "category", category: "Augmented" });
	});

	it("queries under 3 chars never resolve to a category", () => {
		// "mi" is a minor prefix but too short — and "m" is no root, so nothing.
		expect(getNavShortcut("mi")).toBeNull();
		// "d" is the root D, not "diminished".
		expect(getNavShortcut("d")).toEqual({ kind: "root", root: "D" });
	});

	it("empty / whitespace / unparseable input yields no shortcut", () => {
		expect(getNavShortcut("")).toBeNull();
		expect(getNavShortcut("   ")).toBeNull();
		expect(getNavShortcut("xyz")).toBeNull();
	});

	it("every category label it emits exists in CHORD_SUFFIX_CATEGORIES", () => {
		const valid = new Set(CHORD_SUFFIX_CATEGORIES.map((c) => c.category));
		for (const q of ["major", "minor", "dominant", "suspended", "diminished", "augmented", "power"]) {
			const s = getNavShortcut(q);
			expect(s?.kind).toBe("category");
			if (s?.kind === "category") expect(valid.has(s.category)).toBe(true);
		}
	});
});

describe("normalizeChordName — a typed name as a stored identity", () => {
  it("reads a chord the library does not carry", () => {
    expect(normalizeChordName("Cadd9#11")).toEqual({ root: "C", suffix: "add9#11" });
  });

  it("files the same chord under one identity however it was typed", () => {
    expect(normalizeChordName("  cADD9#11 ")).toEqual(normalizeChordName("Cadd9#11"));
  });

  it("applies the same root spelling search does", () => {
    expect(normalizeChordName("D#sus17")).toEqual({ root: "Eb", suffix: "sus17" });
  });

  it("reads a bare root as its major chord", () => {
    expect(normalizeChordName("F")).toEqual({ root: "F", suffix: "major" });
  });

  it("spells a slash chord's bass the way roots are stored", () => {
    expect(normalizeChordName("C/g")).toEqual({ root: "C", suffix: "/G" });
    expect(normalizeChordName("Am/d#")).toEqual({ root: "A", suffix: "m/Eb" });
  });

  it("leaves a bass note it cannot read alone rather than inventing one", () => {
    expect(normalizeChordName("C/xyz")).toEqual({ root: "C", suffix: "/xyz" });
  });

  it("is null for a name with no root note in it — nothing to file it under", () => {
    expect(normalizeChordName("zzz")).toBeNull();
    expect(normalizeChordName("   ")).toBeNull();
  });
});

describe("slug round-trip — every row decodes back to itself", () => {
  it(`round-trips all ${CHORD_ROWS.length} index entries`, () => {
    const failures: { root: string; suffix: string; decodedRoot: string; decodedSuffix: string }[] = [];
    for (const { root, suffix } of CHORD_ROWS) {
      const decodedRoot = slugToRoot(rootToSlug(root));
      const decodedSuffix = slugToSuffix(suffixToSlug(suffix));
      if (decodedRoot !== root || decodedSuffix !== suffix) {
        failures.push({ root, suffix, decodedRoot, decodedSuffix });
      }
    }
    expect(failures).toEqual([]);
  });
});
