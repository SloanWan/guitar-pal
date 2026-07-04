import { describe, it, expect } from "vitest";
import { parseMusicalText, type MusicalTextSegment } from "@/lib/musicalNotation";

function t(value: string): MusicalTextSegment { return { type: "text", value }; }
function flat(): MusicalTextSegment { return { type: "symbol", value: "♭" }; }
function sharp(): MusicalTextSegment { return { type: "symbol", value: "♯" }; }

describe("parseMusicalText", () => {
  it("suffix with # (maj7#5)", () => {
    expect(parseMusicalText("maj7#5")).toEqual([t("maj7"), sharp(), t("5")]);
  });

  it("suffix with b (7b5)", () => {
    expect(parseMusicalText("7b5")).toEqual([t("7"), flat(), t("5")]);
  });

  it("root with # (C#)", () => {
    expect(parseMusicalText("C#")).toEqual([t("C"), sharp()]);
  });

  it("flat root (Bb)", () => {
    expect(parseMusicalText("Bb")).toEqual([t("B"), flat()]);
  });

  it("plain suffix with neither (major)", () => {
    expect(parseMusicalText("major")).toEqual([t("major")]);
  });

  it("uppercase B (root name) is not converted", () => {
    expect(parseMusicalText("B")).toEqual([t("B")]);
  });

  it("multiple occurrences (9#11, mmaj7b5)", () => {
    expect(parseMusicalText("9#11")).toEqual([t("9"), sharp(), t("11")]);
    expect(parseMusicalText("mmaj7b5")).toEqual([t("mmaj7"), flat(), t("5")]);
  });

  it("both # and b in same string (7b9, 7#9)", () => {
    expect(parseMusicalText("7b9")).toEqual([t("7"), flat(), t("9")]);
    expect(parseMusicalText("7#9")).toEqual([t("7"), sharp(), t("9")]);
  });

  it("slash chord suffix display text (/C#, m/Bb)", () => {
    expect(parseMusicalText("/C#")).toEqual([t("/C"), sharp()]);
    expect(parseMusicalText("m/Bb")).toEqual([t("m/B"), flat()]);
  });

  it("empty string returns empty array", () => {
    expect(parseMusicalText("")).toEqual([]);
  });

  it("adjacent symbols (##, bb)", () => {
    expect(parseMusicalText("##")).toEqual([sharp(), sharp()]);
    expect(parseMusicalText("bb")).toEqual([flat(), flat()]);
  });
});
