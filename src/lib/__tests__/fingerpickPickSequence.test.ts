import { describe, it, expect } from "vitest";
import { parsePickSequence, applyPickSequence, foldHolds } from "@/lib/fingerpickPickSequence";
import { makeEmptySlot, setFret, tripletGroups, usedUnits, measureCapacity } from "@/lib/fingerpickEdit";
import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import type { ChordRef } from "@/lib/strumPatterns";
import type { ChordVoicing } from "@/lib/chordVoicing";

const C: ChordRef = { root: "C", suffix: "major" };
const Am: ChordRef = { root: "A", suffix: "minor" };

const SHAPES: Record<string, ChordVoicing> = {
	"C major": { id: "c", label: null, start_fret: 1, barre_fret: null, capo: false, frets: "x32010", fingers: "032010" },
	"A minor": { id: "am", label: null, start_fret: 1, barre_fret: null, capo: false, frets: "x02210", fingers: "002310" },
};
const voicingFor = (ref: ChordRef): ChordVoicing | null => SHAPES[`${ref.root} ${ref.suffix}`] ?? null;

function measure(id: string, chords: (ChordRef | undefined)[]): Measure {
	return {
		id,
		slots: chords.map((chord) => (chord ? { ...makeEmptySlot(), chord } : makeEmptySlot())),
	};
}
function pattern(measures: Measure[]): FingerpickPattern {
	return { id: "p", name: "t", description: "", bpm: 100, timeSignature: [4, 4], measures };
}
const ok = (input: string, ts: [number, number] = [4, 4]) => {
	const parsed = parsePickSequence(input, ts);
	if (!parsed.ok) throw new Error(parsed.error);
	return parsed;
};

describe("parsePickSequence", () => {
	it("reads digits as string numbers, 1 = high e", () => {
		const parsed = ok("3212");
		expect(parsed.duration).toBe("quarter");
		expect(parsed.tokens).toEqual([
			{ strings: [2] },
			{ strings: [1] },
			{ strings: [0] },
			{ strings: [1] },
		]);
	});

	it("groups a pinch in parentheses and ignores whitespace", () => {
		const parsed = ok("6 (32) 1 (32)");
		expect(parsed.tokens).toEqual([
			{ strings: [5] },
			{ strings: [2, 1] },
			{ strings: [0] },
			{ strings: [2, 1] },
		]);
	});

	it("reads 根, R and r as the root, alone or in a pinch, and full-width parentheses", () => {
		expect(ok("根323").tokens).toEqual([
			{ strings: [], root: true },
			{ strings: [2] },
			{ strings: [1] },
			{ strings: [2] },
		]);
		expect(ok("R3（12）3").tokens).toEqual([
			{ strings: [], root: true },
			{ strings: [2] },
			{ strings: [0, 1] },
			{ strings: [2] },
		]);
		expect(ok("(r1)3").tokens).toEqual([{ strings: [0], root: true }, { strings: [2] }]);
		expect(parsePickSequence("(根)3", [2, 4]).ok).toBe(true);
	});

	it("reads 0 and - as rests", () => {
		expect(ok("3-10").tokens).toEqual([
			{ strings: [2] },
			{ rest: true },
			{ strings: [0] },
			{ rest: true },
		]);
	});

	it("reads _ and ^ alike as a hold of the cell before, and counts them as cells", () => {
		expect(ok("3_1^").tokens).toEqual([{ strings: [2] }, { hold: true }, { strings: [0] }, { hold: true }]);
		expect(ok("3_1^").duration).toBe("quarter");
		expect(ok("R_32^132R_32^132").duration).toBe("sixteenth");
	});

	it("refuses a hold with nothing before it, or inside a pinch", () => {
		expect(parsePickSequence("_321", [4, 4])).toMatchObject({ ok: false, error: /needs a note before it/ });
		expect(parsePickSequence("3(2_)", [4, 4])).toMatchObject({ ok: false, error: /part of a pinch/ });
	});

	it.each([
		["3", "whole"],
		["31", "half"],
		["3212", "quarter"],
		["32123212", "eighth"],
		["3212321232123212", "sixteenth"],
	] as const)("%s in 4/4 → %s", (input, duration) => {
		expect(ok(input).duration).toBe(duration);
	});

	it.each([
		["321", "quarter"],
		["321321", "eighth"],
	] as const)("%s in 3/4 → %s", (input, duration) => {
		expect(ok(input, [3, 4]).duration).toBe(duration);
	});

	it("maps three times a plain count to triplets in a simple meter", () => {
		expect(ok("321321321321").duration).toBe("eighth-triplet"); // 12 in 4/4
		expect(ok("321321321321321321321321").duration).toBe("sixteenth-triplet"); // 24 in 4/4
		expect(ok("321321321", [3, 4]).duration).toBe("eighth-triplet"); // 9 in 3/4
		expect(ok("321321", [2, 4]).duration).toBe("eighth-triplet"); // 6 in 2/4
	});

	it("names the quarter-note triplet it cannot write", () => {
		expect(parsePickSequence("321321", [4, 4])).toEqual({
			ok: false,
			error: "6 notes in 4/4 would be quarter-note triplets, which the editor doesn't have yet.",
		});
		expect(parsePickSequence("321", [2, 4]).ok).toBe(false);
	});

	it("reads a compound meter in its dotted beat: 2 / 6 / 12 in 6/8, never quarters or triplets", () => {
		expect(ok("63", [6, 8]).duration).toBe("dotted-quarter");
		expect(ok("632123", [6, 8]).duration).toBe("eighth");
		expect(ok("632123632123", [6, 8]).duration).toBe("sixteenth");
		expect(ok("6321", [12, 8]).duration).toBe("dotted-quarter");
		// Three in 6/8 would be quarters across the 3+3 grouping (a hemiola);
		// four would be dotted eighths; nine would be triplets of a compound beat.
		expect(parsePickSequence("632", [6, 8])).toEqual({
			ok: false,
			error: "3 notes don't fit a 6/8 measure evenly.",
		});
		expect(parsePickSequence("6321", [6, 8]).ok).toBe(false);
		expect(parsePickSequence("632123632", [6, 8]).ok).toBe(false);
	});

	it("refuses a count that does not divide the measure into plain values", () => {
		expect(parsePickSequence("321", [4, 4])).toEqual({
			ok: false,
			error: "3 notes don't fit a 4/4 measure evenly.",
		});
		expect(parsePickSequence("32123", [4, 4]).ok).toBe(false);
		expect(parsePickSequence("3", [3, 4]).ok).toBe(false);
	});

	it("names the hold in the stray-character error", () => {
		expect(parsePickSequence("3~12", [4, 4])).toMatchObject({ ok: false, error: /a hold \(_ or \^\)/ });
	});

	it("rejects strings beyond 6, stray characters and unbalanced pinches", () => {
		expect(parsePickSequence("7", [4, 4]).ok).toBe(false);
		expect(parsePickSequence("3a12", [4, 4]).ok).toBe(false);
		expect(parsePickSequence("(32", [4, 4]).ok).toBe(false);
		expect(parsePickSequence("32)", [4, 4]).ok).toBe(false);
		expect(parsePickSequence("()", [4, 4]).ok).toBe(false);
		expect(parsePickSequence("(3(2))", [4, 4]).ok).toBe(false);
		expect(parsePickSequence("", [4, 4]).ok).toBe(false);
	});
});

describe("foldHolds", () => {
	// Sixteenths in 4/4: a beat is 24 ticks, a bar 96.
	const cells = (spec: string, ticks = 6) => [...spec].map((c) => ({ hold: c === "_", ticks }));
	const fold = (spec: string, ticks = 6, beat = 24, capacity = 96) => foldHolds(cells(spec, ticks), beat, capacity);

	it("lengthens a note inside its beat: two sixteenths are an eighth, three a dotted eighth, four a quarter", () => {
		expect(fold("x_xx")).toEqual([
			{ source: 0, ticks: 12, tied: false },
			{ source: 2, ticks: 6, tied: false },
			{ source: 3, ticks: 6, tied: false },
		]);
		expect(fold("x__x")).toEqual([
			{ source: 0, ticks: 18, tied: false },
			{ source: 3, ticks: 6, tied: false },
		]);
		expect(fold("x___")).toEqual([{ source: 0, ticks: 24, tied: false }]);
	});

	it("ties a hold that crosses a beat line, then lengthens the tied note inside the next beat", () => {
		// R_32^132: the 2 on the fourth sixteenth is held into beat two.
		expect(fold("x_xx_xxx")).toEqual([
			{ source: 0, ticks: 12, tied: false },
			{ source: 2, ticks: 6, tied: false },
			{ source: 3, ticks: 6, tied: false },
			{ source: 3, ticks: 6, tied: true },
			{ source: 5, ticks: 6, tied: false },
			{ source: 6, ticks: 6, tied: false },
			{ source: 7, ticks: 6, tied: false },
		]);
		// Held on for two more cells past the line: the tied note becomes an eighth.
		expect(fold("xxxx__xx")).toEqual([
			{ source: 0, ticks: 6, tied: false },
			{ source: 1, ticks: 6, tied: false },
			{ source: 2, ticks: 6, tied: false },
			{ source: 3, ticks: 6, tied: false },
			{ source: 3, ticks: 12, tied: true },
			{ source: 6, ticks: 6, tied: false },
			{ source: 7, ticks: 6, tied: false },
		]);
	});

	it("lets a note on a beat last whole beats, but never across a bar line", () => {
		// Quarters: a half on beat one, and a half on beat three.
		expect(fold("x_x_", 24)).toEqual([
			{ source: 0, ticks: 48, tied: false },
			{ source: 2, ticks: 48, tied: false },
		]);
		// A half starting on beat two is syncopated: written tied.
		expect(fold("xx_x", 24)).toEqual([
			{ source: 0, ticks: 24, tied: false },
			{ source: 1, ticks: 24, tied: false },
			{ source: 1, ticks: 24, tied: true },
			{ source: 3, ticks: 24, tied: false },
		]);
		// Across the bar: the second bar opens with a tied note.
		expect(fold("xxxx_xxx", 24)).toEqual([
			{ source: 0, ticks: 24, tied: false },
			{ source: 1, ticks: 24, tied: false },
			{ source: 2, ticks: 24, tied: false },
			{ source: 3, ticks: 24, tied: false },
			{ source: 3, ticks: 24, tied: true },
			{ source: 5, ticks: 24, tied: false },
			{ source: 6, ticks: 24, tied: false },
			{ source: 7, ticks: 24, tied: false },
		]);
	});

	it("never lengthens a triplet cell: a held triplet is tied, so the group of three stays whole", () => {
		expect(fold("x_x", 8)).toEqual([
			{ source: 0, ticks: 8, tied: false },
			{ source: 0, ticks: 8, tied: true },
			{ source: 2, ticks: 8, tied: false },
		]);
	});

	it("counts the beat of a compound meter as the dotted quarter", () => {
		// Eighths in 6/8: a beat is 36 ticks. Two eighths inside the beat are a quarter,
		// wherever they sit in it; the third eighth held into beat two is tied.
		expect(fold("x_xxxx", 12, 36, 72)).toEqual([
			{ source: 0, ticks: 24, tied: false },
			{ source: 2, ticks: 12, tied: false },
			{ source: 3, ticks: 12, tied: false },
			{ source: 4, ticks: 12, tied: false },
			{ source: 5, ticks: 12, tied: false },
		]);
		expect(fold("xx_xxx", 12, 36, 72)).toEqual([
			{ source: 0, ticks: 12, tied: false },
			{ source: 1, ticks: 24, tied: false },
			{ source: 3, ticks: 12, tied: false },
			{ source: 4, ticks: 12, tied: false },
			{ source: 5, ticks: 12, tied: false },
		]);
		expect(fold("xxx_xx", 12, 36, 72)).toEqual([
			{ source: 0, ticks: 12, tied: false },
			{ source: 1, ticks: 12, tied: false },
			{ source: 2, ticks: 12, tied: false },
			{ source: 2, ticks: 12, tied: true },
			{ source: 4, ticks: 12, tied: false },
			{ source: 5, ticks: 12, tied: false },
		]);
	});

	it("keeps a hold with nothing before it as a cell of its own", () => {
		expect(fold("_x")).toEqual([
			{ source: 0, ticks: 6, tied: false },
			{ source: 1, ticks: 6, tied: false },
		]);
	});
});

describe("applyPickSequence", () => {
	it("frets each plucked string from the chord in effect", () => {
		const p = pattern([measure("a", [C, undefined, undefined, undefined])]);
		const { pattern: out, warnings } = applyPickSequence(p, 0, ok("5(32)1(32)"), voicingFor);
		const frets = out.measures[0].slots.map((s) => s.strings.map((sf) => sf.fret));
		// C: e0 B1 G0 D2 A3 E/
		expect(frets[0]).toEqual([null, null, null, null, 3, null]);
		expect(frets[1]).toEqual([null, 1, 0, null, null, null]);
		expect(frets[2]).toEqual([0, null, null, null, null, null]);
		expect(warnings).toEqual([]);
		expect(out.measures[0].slots.every((s) => s.duration === "quarter")).toBe(true);
	});

	it("keeps the measure's chord marks in time, so a mid-measure change frets the later beats", () => {
		const p = pattern([measure("a", [C, undefined, Am, undefined])]);
		const { pattern: out } = applyPickSequence(p, 0, ok("54325432"), voicingFor);
		const slots = out.measures[0].slots;
		expect(slots[0].chord).toEqual(C);
		expect(slots[4].chord).toEqual(Am);
		// Beat 3 (index 4) plucks string 5 (A): C → 3, Am → 0.
		expect(slots[0].strings[4].fret).toBe(3);
		expect(slots[4].strings[4].fret).toBe(0);
	});

	it("puts a root token on the root string of the chord in effect", () => {
		const p = pattern([measure("a", [C, undefined, Am, undefined])]);
		const { pattern: out, warnings } = applyPickSequence(p, 0, ok("根3根3"), voicingFor);
		const frets = out.measures[0].slots.map((s) => s.strings.map((sf) => sf.fret));
		// C's root is the A string at 3; Am's is the A string open.
		expect(frets[0]).toEqual([null, null, null, null, 3, null]);
		expect(frets[2]).toEqual([null, null, null, null, 0, null]);
		expect(warnings).toEqual([]);
	});

	it("writes a root with no chord in effect on the open low E, and says so", () => {
		const p = pattern([measure("a", [undefined, undefined, undefined, undefined])]);
		const { pattern: out, warnings } = applyPickSequence(p, 0, ok("根323"), voicingFor);
		expect(out.measures[0].slots[0].strings[5].fret).toBe(0);
		expect(warnings).toHaveLength(1);
	});

	it("writes a string the shape leaves out as a dead note and says so", () => {
		const p = pattern([measure("a", [C, undefined, undefined, undefined])]);
		const { pattern: out, warnings } = applyPickSequence(p, 0, ok("6321"), voicingFor);
		expect(out.measures[0].slots[0].strings[5].muted).toBe(true);
		expect(warnings).toEqual(["String 6 is not in the C shape — written as dead notes."]);
	});

	it("writes rests as rest slots", () => {
		const p = pattern([measure("a", [C, undefined, undefined, undefined])]);
		const { pattern: out } = applyPickSequence(p, 0, ok("3-1-"), voicingFor);
		expect(out.measures[0].slots.map((s) => !!s.isRest)).toEqual([false, true, false, true]);
	});

	it("writes open strings and warns when no chord is in effect", () => {
		const p = pattern([measure("a", [undefined, undefined, undefined, undefined])]);
		const { pattern: out, warnings } = applyPickSequence(p, 0, ok("3212"), voicingFor);
		expect(out.measures[0].slots[0].strings[2].fret).toBe(0);
		expect(warnings).toEqual([
			"No chord in effect here — open strings written. Add a chord to fret them.",
		]);
	});

	it("warns when the chord has no shape, and does not blame a missing chord", () => {
		const p = pattern([measure("a", [{ root: "B", suffix: "dim7" }, undefined, undefined, undefined])]);
		const { warnings } = applyPickSequence(p, 0, ok("3212"), voicingFor);
		expect(warnings).toEqual(["No shape for Bdim7 in the library — its beats are written open."]);
	});

	it("writes twelve tokens as four aligned triplet groups that exactly fill 4/4", () => {
		const p = pattern([measure("a", [C, undefined, undefined, undefined])]);
		const { pattern: out } = applyPickSequence(p, 0, ok("321321321321"), voicingFor);
		const slots = out.measures[0].slots;
		expect(slots.every((s) => s.duration === "eighth-triplet")).toBe(true);
		expect(usedUnits(slots)).toBe(measureCapacity([4, 4]));
		expect(tripletGroups(slots).map((g) => g.start)).toEqual([0, 3, 6, 9]);
		expect(slots[0].chord).toEqual(C);
	});

	it("writes a hold as a longer note inside the beat and as a tied note across it", () => {
		const p = pattern([measure("a", [C, undefined, undefined, undefined])]);
		const { pattern: out, warnings } = applyPickSequence(p, 0, ok("R_32^132R_32^132"), voicingFor);
		const slots = out.measures[0].slots;
		expect(slots.map((s) => s.duration)).toEqual([
			"eighth", "sixteenth", "sixteenth", "sixteenth", "sixteenth", "sixteenth", "sixteenth",
			"eighth", "sixteenth", "sixteenth", "sixteenth", "sixteenth", "sixteenth", "sixteenth",
		]);
		expect(usedUnits(slots)).toBe(measureCapacity([4, 4]));
		// The root lasts an eighth; the 2 before the beat line is carried on, tied, at the same fret.
		expect(slots[0].strings[4]).toMatchObject({ fret: 3, tied: false });
		expect(slots[2].strings[1]).toMatchObject({ fret: 1, tied: false });
		expect(slots[3].strings[1]).toMatchObject({ fret: 1, tied: true });
		expect(slots[3].strings.filter((s) => s.fret !== null)).toHaveLength(1);
		expect(warnings).toEqual([]);
	});

	it("frets a tied note from the chord it started under, not one that changed while it was held", () => {
		// Am takes over at the third quarter; the C note held across it keeps C's fret.
		const p = pattern([measure("a", [C, undefined, Am, undefined])]);
		const { pattern: out } = applyPickSequence(p, 0, ok("32_1"), voicingFor);
		const slots = out.measures[0].slots;
		expect(slots[1].strings[1]).toMatchObject({ fret: 1, tied: false });
		expect(slots[2].strings[1]).toMatchObject({ fret: 1, tied: true });
		expect(slots[2].chord).toEqual(Am);
		expect(slots[3].strings[0]).toMatchObject({ fret: 0, tied: false });
	});

	it("lengthens a rest with a hold", () => {
		const p = pattern([measure("a", [C, undefined, undefined, undefined])]);
		const { pattern: out } = applyPickSequence(p, 0, ok("-_31"), voicingFor);
		expect(out.measures[0].slots.map((s) => [s.duration, !!s.isRest])).toEqual([
			["half", true],
			["quarter", false],
			["quarter", false],
		]);
	});

	it("replaces the measure's old notes and leaves other measures alone", () => {
		let p = pattern([measure("a", [C, undefined]), measure("b", [undefined, undefined])]);
		p = setFret(p, { measureIndex: 1, slotIndex: 0, stringIndex: 0 }, 7);
		const { pattern: out } = applyPickSequence(p, 0, ok("3212"), voicingFor);
		expect(out.measures[0].slots).toHaveLength(4);
		expect(out.measures[1]).toBe(p.measures[1]);
	});
});
