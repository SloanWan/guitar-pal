import { describe, it, expect } from "vitest";
import { buildTabProposal } from "@/lib/tabAssistant/buildTabProposal";
import { parsePickOrder } from "@/lib/tabAssistant/parsePickOrder";
import { TAB_STYLES } from "@/lib/tabAssistant/styles";
import { measureCapacity, usedUnits } from "@/lib/fingerpickEdit";
import type { Measure } from "@/lib/fingerpickTypes";
import { voicingFor } from "./fixtures";

const Am = { text: "Am", chord: { root: "A", suffix: "minor", voicingId: null } };
const C = { text: "C", chord: { root: "C", suffix: "major", voicingId: null } };
const G = { text: "G", chord: { root: "G", suffix: "major", voicingId: null } };
const D = { text: "D", chord: { root: "D", suffix: "major", voicingId: null } };
const Bad = { text: "Cmaj13#11", chord: null };

const order = (text: string) => {
	const parsed = parsePickOrder(text);
	if (!parsed.ok) throw new Error(parsed.error);
	return parsed.order;
};
const build = (input: Omit<Parameters<typeof buildTabProposal>[0], "voicingFor">) => {
	const result = buildTabProposal({ ...input, voicingFor });
	if (!result.ok) throw new Error(result.error);
	return result.proposal;
};
/** The frets sounded per slot, as "string:fret" pairs, high e first. */
const sounded = (measure: Measure) =>
	measure.slots.map((slot) =>
		slot.isRest
			? "rest"
			: slot.strings
					.map((s, i) => (s.muted ? `${i + 1}:x` : s.fret === null ? null : `${i + 1}:${s.fret}`))
					.filter((s): s is string => s !== null)
					.join(" "),
	);
const codes = (p: ReturnType<typeof build>) => p.warnings.map((w) => w.code);

describe("buildTabProposal", () => {
	describe("from a written order", () => {
		it("frets the order from the chord's shape", () => {
			const p = build({ chordWords: [Am], order: order("5 3 2 1 3 2 1 3") });
			expect(p.pattern.measures).toHaveLength(1);
			// Am is x02210 low to high: string 5 open, 3 at 2, 2 at 1, 1 open.
			expect(sounded(p.pattern.measures[0])).toEqual(["5:0", "3:2", "2:1", "1:0", "3:2", "2:1", "1:0", "3:2"]);
			expect(p.pattern.measures[0].slots.every((s) => s.duration === "eighth")).toBe(true);
			expect(p.pattern.measures[0].slots[0].chord).toEqual(Am.chord);
			expect(p.chords).toEqual([Am.chord]);
			expect(codes(p)).toEqual([]);
		});

		it("writes one bar per chord word, in order", () => {
			const p = build({ chordWords: [C, G, Am], order: order("5 3 2 1 3 2 1 3") });
			expect(p.pattern.measures).toHaveLength(3);
			expect(p.pattern.measures.map((m) => m.slots[0].chord)).toEqual([C.chord, G.chord, Am.chord]);
			expect(sounded(p.pattern.measures[0])[0]).toBe("5:3");
			expect(sounded(p.pattern.measures[1])[0]).toBe("5:2");
		});

		it("puts a root token on each chord's own root string, bar by bar", () => {
			const p = build({ chordWords: [C, G, Am, D], order: order("根3231323") });
			expect(p.pattern.measures).toHaveLength(4);
			// C and Am root on string 5, G on 6, D on 4 — one order, four basses.
			expect(p.pattern.measures.map((m) => sounded(m)[0])).toEqual(["5:3", "6:3", "5:0", "4:0"]);
			expect(sounded(p.pattern.measures[1]).slice(1, 4)).toEqual(["3:0", "2:0", "3:0"]);
			expect(codes(p)).toEqual([]);
		});

		it("pinches the root with the strings written beside it", () => {
			const p = build({ chordWords: [G], order: order("根3(12)3 (根1)3(12)3") });
			expect(sounded(p.pattern.measures[0])).toEqual(["6:3", "3:0", "1:3 2:0", "3:0", "1:3 6:3", "3:0", "1:3 2:0", "3:0"]);
		});

		it("writes a root over a chord with no shape on the open low E, and says so", () => {
			const p = build({ chordWords: [{ text: "F", chord: { root: "F", suffix: "major", voicingId: null } }], order: order("根323") });
			expect(sounded(p.pattern.measures[0])[0]).toBe("6:0");
			expect(codes(p)).toEqual(["NO_SHAPE"]);
		});

		it("repeats an order that divides the bar, so 5 3 2 1 is the arpeggio and not half of one", () => {
			const p = build({ chordWords: [Am], order: order("5 3 2 1") });
			expect(p.pattern.measures).toHaveLength(1);
			expect(p.pattern.measures[0].slots).toHaveLength(8);
			expect(codes(p)).toEqual([]);
		});

		it("splits an order that overflows the bar across bars, and pads the last", () => {
			const p = build({ chordWords: [Am], order: order("5 3 2 1 3 2 1 3 5 3 2 1") });
			expect(p.pattern.measures).toHaveLength(2);
			const capacity = measureCapacity([4, 4]);
			expect(usedUnits(p.pattern.measures[0].slots)).toBe(capacity);
			expect(usedUnits(p.pattern.measures[1].slots)).toBe(capacity);
			expect(sounded(p.pattern.measures[1]).slice(0, 4)).toEqual(["5:0", "3:2", "2:1", "1:0"]);
			expect(p.pattern.measures[1].slots.slice(4).every((s) => s.isRest)).toBe(true);
			expect(codes(p)).toContain("PADDED");
		});

		it("takes the note value and the meter it was given", () => {
			const p = build({ chordWords: [Am], order: order("5 3 2 1 3 2"), duration: "eighth", timeSignature: [6, 8] });
			expect(p.pattern.timeSignature).toEqual([6, 8]);
			expect(p.pattern.measures[0].slots).toHaveLength(6);
			expect(codes(p)).toEqual([]);
			const s = build({ chordWords: [Am], order: order("5321"), duration: "sixteenth" });
			expect(s.pattern.measures[0].slots).toHaveLength(16);
		});

		it("writes an alternating bass as it was said", () => {
			const p = build({ chordWords: [C], order: order("5/4 2 1 3") });
			expect(sounded(p.pattern.measures[0])).toEqual(["5:3", "2:1", "1:0", "3:0", "4:2", "2:1", "1:0", "3:0"]);
		});

		it("keeps an unknown chord's bar as rests, and says so", () => {
			const p = build({ chordWords: [Bad, G], order: order("5 3 2 1 3 2 1 3") });
			expect(p.pattern.measures).toHaveLength(2);
			expect(p.pattern.measures[0].slots.every((s) => s.isRest)).toBe(true);
			expect(p.pattern.measures[0].slots[0].chord).toBeUndefined();
			expect(sounded(p.pattern.measures[1])[0]).toBe("5:2");
			expect(p.chords).toEqual([G.chord]);
			const w = p.warnings.find((w) => w.code === "UNRESOLVED_CHORD");
			expect(w?.message).toContain("Cmaj13#11");
		});

		it("writes a string the shape leaves out as a dead note, and says so", () => {
			// D is xx0232: strings 6 and 5 are not in the shape.
			const p = build({ chordWords: [D], order: order("6 3 2 1") });
			expect(sounded(p.pattern.measures[0])[0]).toBe("6:x");
			expect(p.warnings.find((w) => w.code === "STRING_NOT_IN_SHAPE")?.message).toContain("String 6");
		});

		it("writes open strings when the library has no shape, and when no chord was named", () => {
			const F = { text: "F", chord: { root: "F", suffix: "major", voicingId: null } };
			const noShape = build({ chordWords: [F], order: order("5 3 2 1") });
			expect(sounded(noShape.pattern.measures[0])[0]).toBe("5:0");
			expect(codes(noShape)).toContain("NO_SHAPE");
			const noChord = build({ chordWords: [], order: order("5 3 2 1") });
			expect(noChord.pattern.measures).toHaveLength(1);
			expect(noChord.pattern.measures[0].slots[0].chord).toBeUndefined();
			expect(codes(noChord)).toContain("NO_CHORD");
		});
	});

	describe("from a style word", () => {
		const travis = TAB_STYLES.find((s) => s.key === "travis")!;
		const waltz = TAB_STYLES.find((s) => s.key === "waltz")!;

		it("lays the preset's first bar over the chord", () => {
			const p = build({ chordWords: [Am], style: travis });
			expect(p.pattern.measures).toHaveLength(1);
			expect(p.pattern.timeSignature).toEqual([4, 4]);
			expect(p.pattern.bpm).toBe(100);
			// Every sounded note is one of Am's frets on its string.
			const hints = [0, 1, 2, 2, 0, null];
			for (const slot of p.pattern.measures[0].slots) {
				slot.strings.forEach((s, i) => {
					if (s.fret !== null) expect(s.fret).toBe(hints[i]);
				});
			}
			expect(p.name).toBe("Travis in Am");
		});

		it("keeps the preset's own meter, rhythm and tempo", () => {
			const p = build({ chordWords: [G], style: waltz });
			expect(p.pattern.timeSignature).toEqual([3, 4]);
			expect(p.pattern.measures[0].slots.map((s) => s.duration)).toEqual(["quarter", "quarter", "quarter"]);
			expect(p.pattern.bpm).toBe(120);
		});

		it("takes a tempo and a name over the preset's", () => {
			const p = build({ chordWords: [Am], style: travis, bpm: 80, name: "slow travis" });
			expect(p.pattern.bpm).toBe(80);
			expect(p.bpm).toBe(80);
			expect(p.name).toBe("slow travis");
		});
	});

	describe("from chords alone", () => {
		it("uses a default order and says it was a guess", () => {
			const p = build({ chordWords: [C, G] });
			expect(p.pattern.measures).toHaveLength(2);
			expect(codes(p)).toContain("ORDER_GUESSED");
			expect(p.name).toBe("Arpeggio in C G");
		});
	});

	it("carries a capo onto the pattern", () => {
		const p = build({ chordWords: [Am], order: order("5 3 2 1"), capo: 2 });
		expect(p.pattern.capo).toBe(2);
	});
});
