import { describe, it, expect } from "vitest";
import { chordQualityLine, clampShape, pageShapes, shapeCaption } from "@/lib/chordPage";
import { toVoicingCards } from "@/lib/chordCards";
import { chordSymbol } from "@/lib/chordSuffixes";
import type { ChordVoicing } from "@/lib/chordVoicing";
import type { UserChordVoicing } from "@/lib/userChordVoicings";

const openC: ChordVoicing = { id: "c1", label: "Standard", start_fret: 1, barre_fret: null, capo: false, frets: "x32010", fingers: "032010" };
const cOverE: ChordVoicing = { id: "c2", label: "Variation 2", start_fret: 1, barre_fret: null, capo: false, frets: "032010", fingers: "032010" };
const mine: UserChordVoicing = { id: "u:1", root: "C", suffix: "major", label: null, start_fret: 8, barre_fret: null, capo: false, frets: "1x3211", fingers: "1x4211" };

describe("pageShapes", () => {
	it("lists the library's shapes first, then the player's own", () => {
		const shapes = pageShapes(toVoicingCards([openC, cOverE], "C", "major"), [mine], "C", "major");
		expect(shapes.map((s) => s.id)).toEqual(["c1", "c2", "u:1"]);
		expect(shapes.map((s) => s.mine)).toEqual([false, false, true]);
	});

	it("writes each shape as a tab, first string first, and names an unnamed shape of one's own", () => {
		const [standard, , own] = pageShapes(toVoicingCards([openC, cOverE], "C", "major"), [mine], "C", "major");
		expect(standard.tab).toBe("01023x");
		expect(own.tab).toBe("8 8 9 10 x 8");
		expect(own.label).toBe("Mine");
	});

	it("captions an inversion by its slash name", () => {
		const [, inversion] = pageShapes(toVoicingCards([openC, cOverE], "C", "major"), [], "C", "major");
		expect(inversion.caption).toBe("C major/E");
	});
});

describe("shapeCaption", () => {
	it("joins the inversion and what the shape leaves out", () => {
		expect(shapeCaption({ bass: "E", omits: ["5"] }, "C", "major")).toBe("C major/E · omits 5");
		expect(shapeCaption({ bass: null, omits: [] }, "C", "major")).toBe("");
	});
});

describe("clampShape", () => {
	it("keeps an index on a list that shrank", () => {
		expect(clampShape(4, 3)).toBe(2);
		expect(clampShape(-1, 3)).toBe(0);
		expect(clampShape(2, 0)).toBe(0);
	});
});

describe("chordSymbol", () => {
	it("writes a chord the way a chart does", () => {
		expect(chordSymbol("C", "major")).toBe("C");
		expect(chordSymbol("A", "minor")).toBe("Am");
		expect(chordSymbol("C", "maj7")).toBe("Cmaj7");
		expect(chordSymbol("C", "/E")).toBe("C/E");
		expect(chordSymbol("?", "uk-x32010")).toBe("uk-x32010");
	});
});

describe("chordQualityLine", () => {
	it("says what the chord is", () => {
		expect(chordQualityLine("C", "maj7")).toBe("Major seventh");
		expect(chordQualityLine("C", "/E")).toBe("Major triad over E");
		expect(chordQualityLine("A", "m/G")).toBe("Minor triad over G");
		expect(chordQualityLine("?", "uk-x32010")).toBe("Your own chord");
	});
});
