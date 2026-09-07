import { describe, it, expect } from "vitest";
import {
	bassNoteName,
	identifyChords,
	pitchClassRoot,
	pitchClassSet,
	shapeMidi,
} from "@/lib/chordIdentify";
import { parseTabSequence, tabSequenceToShape } from "@/lib/chordTabSequence";
import { chordShapeToVoicing } from "@/lib/chordShape";
import type { ShapeSearchChord } from "@/lib/chordShapeSearch";

const frets = (tab: string) => parseTabSequence(tab).frets!;

/** A chord stored with its shapes, written the way a tab writes them. */
function chord(root: string, suffix: string, ...tabs: string[]): ShapeSearchChord {
	return {
		root,
		suffix,
		chord_voicings: tabs.map((tab, i) =>
			chordShapeToVoicing(tabSequenceToShape(frets(tab)), `${root}${suffix}-${i}`),
		),
	};
}

describe("the notes a shape sounds", () => {
	it("reads pitches off the neck in standard tuning", () => {
		// x32010 — C major: C E G C E.
		expect(shapeMidi(frets("01023x"))).toEqual([48, 52, 55, 60, 64]);
	});

	it("skips muted strings rather than sounding them open", () => {
		expect(shapeMidi(frets("xxxx3x"))).toEqual([48]);
	});

	it("collapses octaves and doublings to a set of pitch classes", () => {
		expect(pitchClassSet(shapeMidi(frets("01023x")))).toEqual([0, 4, 7]);
	});

	it("names the lowest note, which is a fact even when the chord is not", () => {
		expect(bassNoteName(frets("01023x"))).toBe("C");
		// x05700 — an E minor seventh sitting on an A.
		expect(bassNoteName(frets("00750x"))).toBe("A");
	});

	it("has no bass note for a shape that sounds nothing", () => {
		expect(bassNoteName([])).toBeNull();
	});

	it("spells pitch classes the way the library does", () => {
		expect(pitchClassRoot(3)).toBe("Eb");
		expect(pitchClassRoot(1)).toBe("C#");
	});
});

describe("identifyChords", () => {
	const LIBRARY: ShapeSearchChord[] = [
		chord("C", "major", "01023x"),
		chord("C", "/E", "010230"),
		chord("C", "/G", "010233"),
		chord("A", "minor", "01220x"),
		chord("A", "m7", "01020x"),
		chord("E", "minor", "0022xx"),
		chord("E", "m7", "0032xx"),
		chord("G", "major", "300023"),
	];

	it("names a shape from the notes it sounds", () => {
		const [best] = identifyChords(LIBRARY, frets("01023x"));
		expect(best).toMatchObject({ root: "C", suffix: "major", exact: true });
	});

	it("tells an inversion from the chord it inverts, by the bass note", () => {
		// The same three notes; only the lowest one says which name is right.
		expect(identifyChords(LIBRARY, frets("010230"))[0]).toMatchObject({ suffix: "/E" });
		expect(identifyChords(LIBRARY, frets("010233"))[0]).toMatchObject({ suffix: "/G" });
		expect(identifyChords(LIBRARY, frets("01023x"))[0]).toMatchObject({ suffix: "major" });
	});

	it("names a shape the library has never been drawn with", () => {
		// The A-shape C barred at the third fret (x35553). The library here carries
		// no such voicing; the notes are still C, E and G, which is the whole point
		// of naming by pitch class rather than by grip.
		expect(identifyChords(LIBRARY, frets("35553x"))[0]).toMatchObject({
			root: "C",
			suffix: "major",
		});
	});

	it("keeps close answers out of the way when an exact one exists", () => {
		expect(identifyChords(LIBRARY, frets("01023x")).every((g) => g.exact)).toBe(true);
	});

	it("offers a close answer when nothing has exactly those notes", () => {
		// x02410 sounds A C E B — an A minor with a ninth on top, which this
		// library carries no name for. One note away from A minor is the most
		// useful thing anyone can say about it.
		const guesses = identifyChords(LIBRARY, frets("01420x"));
		expect(guesses.length).toBeGreaterThan(0);
		expect(guesses[0]).toMatchObject({ root: "A", suffix: "minor", exact: false });
		expect(guesses.every((g) => !g.exact)).toBe(true);
	});

	it("says nothing about a shape too small to be a chord", () => {
		expect(identifyChords(LIBRARY, frets("xxxx3x"))).toEqual([]);
	});

	it("lists a chord once however many of its voicings answer", () => {
		const doubled: ShapeSearchChord[] = [chord("C", "major", "01023x", "088x8x")];
		expect(identifyChords(doubled, frets("01023x"))).toHaveLength(1);
	});

	it("honours the limit", () => {
		expect(identifyChords(LIBRARY, frets("01023x"), 1)).toHaveLength(1);
	});
});
