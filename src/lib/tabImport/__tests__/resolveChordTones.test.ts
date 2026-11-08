import { describe, expect, it } from "vitest";
import type { FretHint } from "@/lib/fingerpickChords";
import type { ChordRef } from "@/lib/strumPatterns";
import { chordToneChords, resolveDraftChordTones } from "@/lib/tabImport";

// The library's standard shapes, high e first: C x32010, G 320003.
const SHAPES: Record<string, FretHint[]> = {
	"C major": [0, 1, 0, 2, 3, "/"],
	"G major": [3, 0, 0, 0, 2, 3],
};
const shapeOf = (chord: ChordRef) => SHAPES[`${chord.root} ${chord.suffix}`] ?? null;

const C: ChordRef = { root: "C", suffix: "major", voicingId: null };
const G: ChordRef = { root: "G", suffix: "major", voicingId: null };

/** A slot whose listed strings (1 = high e) are a rhythm pattern's ×, and whose `frets` are digits. */
function slot(tones: number[], extra: Record<string, unknown> = {}, frets: Record<number, number> = {}) {
	const strings = Array.from({ length: 6 }, (_, i) =>
		tones.includes(i + 1)
			? { fret: null, muted: false, chordTone: true }
			: { fret: frets[i + 1] ?? null, muted: false },
	);
	return { duration: "eighth", strings, ...extra };
}

type Draft = { measures: { slots: { strings: Record<string, unknown>[] }[] }[] };
const fretsOf = (draft: unknown, bar: number, at: number) =>
	(draft as Draft).measures[bar].slots[at].strings.map((s) => s.fret);

describe("resolveDraftChordTones", () => {
	it("writes each × as the fret the chord in effect holds on that string, across barlines", () => {
		const draft = {
			name: "p6",
			measures: [
				{ slots: [slot([5, 3], { chord: C }), slot([1], {}, { 2: 3 })] },
				{ slots: [slot([1, 6], { chord: G }), slot([3])] },
			],
		};
		const { draft: out, warnings } = resolveDraftChordTones(draft, shapeOf);
		expect(warnings).toEqual([]);
		expect(fretsOf(out, 0, 0)).toEqual([null, null, 0, null, 3, null]);
		// A printed digit beside the × stays as printed.
		expect(fretsOf(out, 0, 1)).toEqual([0, 3, null, null, null, null]);
		expect(fretsOf(out, 1, 0)).toEqual([3, null, null, null, null, 3]);
		expect(fretsOf(out, 1, 1)).toEqual([null, null, 0, null, null, null]);
		const cells = (out as Draft).measures.flatMap((m) => m.slots.flatMap((s) => s.strings));
		expect(cells.some((c) => "chordTone" in c)).toBe(false);
		expect((out as { name: string }).name).toBe("p6");
	});

	it("writes a × under no chord, or under N.C., as the open string, without a warning", () => {
		const draft = {
			measures: [{ slots: [slot([5]), slot([3]), slot([2], { chord: { root: "N.C.", suffix: "" } })] }],
		};
		const { draft: out, warnings } = resolveDraftChordTones(draft, shapeOf);
		expect(warnings).toEqual([]);
		expect(fretsOf(out, 0, 0)[4]).toBe(0);
		expect(fretsOf(out, 0, 1)[2]).toBe(0);
		expect(fretsOf(out, 0, 2)[1]).toBe(0);
	});

	it("writes open, and says so, a string the shape leaves out or a chord with no shape", () => {
		const draft = {
			measures: [
				{ slots: [slot([6, 5], { chord: C }), slot([1, 2], { chord: { root: "E", suffix: "5", voicingId: null } })] },
			],
		};
		const { draft: out, warnings } = resolveDraftChordTones(draft, shapeOf);
		expect(fretsOf(out, 0, 0)).toEqual([null, null, null, null, 3, 0]);
		expect(fretsOf(out, 0, 1)).toEqual([0, 0, null, null, null, null]);
		expect(warnings).toEqual([
			expect.objectContaining({ code: "TAB_CHORD_TONE", path: "measures[0].slots[0]", message: expect.stringContaining("string 6") }),
			expect.objectContaining({ code: "TAB_CHORD_TONE", path: "measures[0].slots[1]", message: expect.stringContaining("no shape for E 5") }),
		]);
	});

	it("hands back a draft with no × untouched", () => {
		const draft = { measures: [{ slots: [slot([], {}, { 1: 0 })] }] };
		expect(resolveDraftChordTones(draft, shapeOf).draft).toBe(draft);
		expect(resolveDraftChordTones({ measures: "nope" }, shapeOf).draft).toEqual({ measures: "nope" });
	});
});

describe("chordToneChords", () => {
	it("lists once each chord a × stands under, and no chord only digits stand under", () => {
		const draft = {
			measures: [
				{ slots: [slot([], { chord: { root: "A", suffix: "minor", voicingId: null } }, { 1: 0 }), slot([1], { chord: C })] },
				{ slots: [slot([2]), slot([1], { chord: G }), slot([3], { chord: { root: "N.C.", suffix: "" } })] },
			],
		};
		expect(chordToneChords(draft)).toEqual([C, G]);
	});
});
