import { describe, it, expect } from "vitest";
import { parsePickSequence, applyPickSequence } from "@/lib/fingerpickPickSequence";
import { makeEmptySlot, setFret, tripletGroups, usedUnits, measureCapacity } from "@/lib/fingerpickEdit";
import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import type { ChordRef } from "@/lib/strumPatterns";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

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

	it("replaces the measure's old notes and leaves other measures alone", () => {
		let p = pattern([measure("a", [C, undefined]), measure("b", [undefined, undefined])]);
		p = setFret(p, { measureIndex: 1, slotIndex: 0, stringIndex: 0 }, 7);
		const { pattern: out } = applyPickSequence(p, 0, ok("3212"), voicingFor);
		expect(out.measures[0].slots).toHaveLength(4);
		expect(out.measures[1]).toBe(p.measures[1]);
	});
});
