import { describe, it, expect } from "vitest";
import { searchChordsByShape, shapeMatch, voicingFrets } from "@/lib/chordShapeSearch";
import { parseTabSequence, tabSequenceToShape } from "@/lib/chordTabSequence";
import { chordShapeToVoicing } from "@/lib/chordShape";
import type { ShapeSearchChord } from "@/lib/chordShapeSearch";

/** A chord stored with one shape, written the way a tab writes it. */
function chord(root: string, suffix: string, ...tabs: string[]): ShapeSearchChord {
	return {
		root,
		suffix,
		chord_voicings: tabs.map((tab, i) =>
			chordShapeToVoicing(tabSequenceToShape(parseTabSequence(tab).frets!), `${root}-${i}`),
		),
	};
}

const frets = (tab: string) => parseTabSequence(tab).frets!;

describe("voicingFrets — stored windows do not change the grip", () => {
	it("reads a shape back as frets on the neck, whatever window it was stored in", () => {
		// Em7/A sits in a window starting at the fifth fret; its frets are still 5
		// and 7 on the neck, which is the only form two shapes can be compared in.
		const voicing = chordShapeToVoicing(tabSequenceToShape(frets("00750x")), "v");
		expect(voicing.start_fret).toBe(5);
		expect(voicingFrets(voicing)).toEqual(frets("00750x"));
	});
});

describe("shapeMatch", () => {
	it("calls the same frets an exact match", () => {
		expect(shapeMatch(frets("01023x"), frets("01023x"))).toEqual({ kind: "exact" });
	});

	it("counts the strings that differ", () => {
		expect(shapeMatch(frets("01023x"), frets("01033x"))).toEqual({
			kind: "near",
			differences: 1,
		});
	});

	it("recognises one grip played further up the neck", () => {
		// The E-shape barre: E is 022100 at the nut, F is 133211 one fret up — the
		// same hand with a finger where the nut was.
		expect(shapeMatch(frets("001220"), frets("112331"))).toEqual({
			kind: "transposed",
			semitones: 1,
		});
	});

	it("is not the same grip when only part of it moved", () => {
		// The fretted notes went up a fret and the open strings stayed put: that is
		// a different hand, not the same one further along.
		expect(shapeMatch(frets("00220x"), frets("00331x"))).toBeNull();
	});

	it("is null for a shape that is neither near nor the same grip", () => {
		expect(shapeMatch(frets("01023x"), frets("x 12 12 12 10 x"))).toBeNull();
	});
});

describe("searchChordsByShape", () => {
	const LIBRARY: ShapeSearchChord[] = [
		chord("C", "major", "01023x"),
		chord("A", "minor", "01220x"),
		chord("E", "major", "0022xx", "001220"),
		chord("F", "major", "112331"),
		chord("D", "major", "2320xx"),
	];

	it("finds the chord a tab was written for", () => {
		const [best] = searchChordsByShape(LIBRARY, frets("01023x"));
		expect(best).toMatchObject({ root: "C", suffix: "major", match: { kind: "exact" } });
	});

	it("puts the exact answer above the near ones", () => {
		const found = searchChordsByShape(LIBRARY, frets("01220x"));
		expect(found[0]).toMatchObject({ root: "A", suffix: "minor" });
		expect(found[0].match).toEqual({ kind: "exact" });
	});

	it("offers the same grip elsewhere on the neck, below the near misses", () => {
		const found = searchChordsByShape(LIBRARY, frets("001220"));
		const f = found.find((m) => m.root === "F");
		expect(f?.match).toEqual({ kind: "transposed", semitones: 1 });
		expect(found.indexOf(f!)).toBeGreaterThan(0);
	});

	it("lists a chord once, under the shape that answered best", () => {
		const found = searchChordsByShape(LIBRARY, frets("001220"));
		expect(found.filter((m) => m.root === "E")).toHaveLength(1);
		expect(found.find((m) => m.root === "E")?.match).toEqual({ kind: "exact" });
	});

	it("reports the category the name search would report", () => {
		expect(searchChordsByShape(LIBRARY, frets("01220x"))[0].category).toBe("Minor");
	});

	it("returns nothing when no shape in the library is close", () => {
		expect(searchChordsByShape(LIBRARY, frets("x 12 10 12 10 x"))).toEqual([]);
	});

	it("honours the limit", () => {
		expect(searchChordsByShape(LIBRARY, frets("01023x"), 1)).toHaveLength(1);
	});
});
