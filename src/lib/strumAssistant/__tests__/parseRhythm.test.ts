import { describe, it, expect } from "vitest";
import { parseRhythm, acceptedRhythmCharacters } from "@/lib/strumAssistant/parseRhythm";
import { patternNotation } from "@/lib/strumNotation";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";
import type { Beat } from "@/lib/strumPatterns";

function beatsOf(input: string, options?: Parameters<typeof parseRhythm>[1]): Beat[] {
	const result = parseRhythm(input, options);
	if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("; "));
	expect(result.value.bars).toHaveLength(1);
	return result.value.bars[0].beats;
}

describe("parseRhythm", () => {
	describe("round-trips the shipped presets", () => {
		// The ghost-cell rule was derived from these patterns rather than invented,
		// so they are the calibration set: if the rule drifts, these fail first.
		// Presets whose beats have differing cell counts cannot be written as a
		// single-subdivision string at all, so they are excluded by construction.
		const uniform = PRESET_STRUM_PATTERNS.filter(
			(p) => new Set(p.beats.map((b) => b.length)).size === 1,
		);

		it("covers most of the preset library", () => {
			expect(uniform.length).toBeGreaterThanOrEqual(5);
		});

		for (const preset of uniform) {
			it(`"${preset.name}" survives notation → parse`, () => {
				const notation = patternNotation(preset.beats);
				const parsed = beatsOf(notation, {
					beatsPerBar: preset.beats.length,
					cellsPerBeat: preset.beats[0].length,
				});
				expect(parsed).toEqual(preset.beats);
			});
		}
	});

	describe("cell stream", () => {
		it("reads a space as a blank cell, not a separator", () => {
			// "D DU UD" is 7 cells, matching patternNotation's output for old faithful.
			expect(beatsOf("D DU UD")).toEqual([
				["D", "UG"],
				["D", "U"],
				["DG", "U"],
				["D", "UG"],
			]);
		});

		it("reads a fully struck eighth-note bar", () => {
			expect(beatsOf("DUDUDUDU")).toEqual([
				["D", "U"],
				["D", "U"],
				["D", "U"],
				["D", "U"],
			]);
		});

		it("infers sixteenths from a 16-cell stream", () => {
			const beats = beatsOf("DUDUDUDUDUDUDUDU");
			expect(beats).toHaveLength(4);
			expect(beats[0]).toEqual(["D", "U", "D", "U"]);
		});

		it("infers quarters from a 4-cell stream", () => {
			expect(beatsOf("DDDD")).toEqual([["D"], ["D"], ["D"], ["D"]]);
		});

		it("accepts . - _ as blank cells", () => {
			expect(beatsOf("D.D-D_D.")).toEqual([
				["D", "UG"],
				["D", "UG"],
				["D", "UG"],
				["D", "UG"],
			]);
		});

		it("is case insensitive", () => {
			expect(beatsOf("dudu")).toEqual(beatsOf("DUDU"));
		});

		it("keeps muted strokes as struck cells", () => {
			expect(beatsOf("DXUX", { cellsPerBeat: 4, beatsPerBar: 1 })).toEqual([
				["D", "X", "U", "X"],
			]);
		});
	});

	describe("Chinese notation", () => {
		it("maps 下 to a downstroke and 上 to an upstroke", () => {
			expect(beatsOf("下上下上")).toEqual(beatsOf("DUDU"));
		});

		it("accepts a full-width space as a blank cell", () => {
			expect(beatsOf("下　下上　上下")).toEqual(beatsOf("D DU UD"));
		});
	});

	describe("ghost cells and rests", () => {
		it("ghosts the return stroke after the last strike", () => {
			// One cell infers a quarter grid, where the return lands on beat 2.
			expect(beatsOf("D")).toEqual([["D"], ["DG"], [""], [""]]);
		});

		it("reproduces the 'on the one' preset on an eighth grid", () => {
			expect(beatsOf("D", { cellsPerBeat: 2 })).toEqual([
				["D", "UG"],
				["", ""],
				["", ""],
				["", ""],
			]);
		});

		it("ghosts gaps between strikes but rests before the first", () => {
			// _ _ D _ _ D (_ _ trimmed then re-padded): the hand is still before
			// the first strike, travelling between the two, and stops after.
			expect(beatsOf("  D  D  ")).toEqual([
				["", ""],
				["D", "UG"],
				["DG", "D"],
				["DG", ""],
			]);
		});

		it("gives a ghost the direction of its slot in the beat", () => {
			const beats = beatsOf("D  UD  U", { cellsPerBeat: 4, beatsPerBar: 2 });
			expect(beats[0]).toEqual(["D", "UG", "DG", "U"]);
			expect(beats[1]).toEqual(["D", "UG", "DG", "U"]);
		});

		it("returns an all-rest bar when nothing is struck", () => {
			const result = parseRhythm("....");
			expect(result.ok).toBe(false);
		});
	});

	describe("bars", () => {
		it("splits on |", () => {
			const result = parseRhythm("D DU UD|DUDUDUDU");
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.value.bars).toHaveLength(2);
			expect(result.value.bars[0].beats[2]).toEqual(["DG", "U"]);
			expect(result.value.bars[1].beats[0]).toEqual(["D", "U"]);
		});

		it("holds every bar to the first bar's subdivision", () => {
			// Bar 2's four cells would infer quarters on their own; inheriting the
			// first bar's sixteenths puts them all inside beat 1 instead.
			const result = parseRhythm("DUDUDUDUDUDUDUDU|DDDD");
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.value.cellsPerBeat).toBe(4);
			expect(result.value.bars[1].beats[0]).toEqual(["D", "D", "D", "D"]);
			expect(result.value.bars[1].beats[1]).toEqual(["DG", "", "", ""]);
		});

		it("reports padding when the input does not fill the grid", () => {
			const result = parseRhythm("D");
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.value.padded).toBe(true);
		});

		it("honours a non-4/4 meter", () => {
			const beats = beatsOf("DUDUDU", { beatsPerBar: 3 });
			expect(beats).toHaveLength(3);
			expect(beats[0]).toEqual(["D", "U"]);
		});
	});

	describe("errors", () => {
		it("rejects empty input", () => {
			const result = parseRhythm("   ");
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.errors[0].code).toBe("empty");
		});

		it("reports the offset of an invalid character", () => {
			const result = parseRhythm("DUxQU");
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.errors[0].code).toBe("invalid-character");
			expect(result.errors[0].index).toBe(3);
		});

		it("rejects a stream that overflows the bar", () => {
			// A bar holds four beats of at most six cells since compound meters
			// landed; 25 is the first count that fits into none of them.
			const result = parseRhythm("D".repeat(25));
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.errors[0].code).toBe("too-many-cells");
		});

		it("rejects out-of-range options", () => {
			// Not a range any more: no meter divides a beat five ways.
			expect(parseRhythm("DUDU", { cellsPerBeat: 5 }).ok).toBe(false);
			expect(parseRhythm("DUDU", { beatsPerBar: 0 }).ok).toBe(false);
		});

		it("never throws on arbitrary input", () => {
			for (const junk of ["", "🎸", "\n\t", "|||", "D|", "0123"]) {
				expect(() => parseRhythm(junk)).not.toThrow();
			}
		});
	});

	it("publishes the character set it accepts", () => {
		const chars = acceptedRhythmCharacters();
		expect(chars).toContain("D");
		expect(chars).toContain("上");
		expect(chars).toContain(" ");
	});
});
