import { describe, it, expect } from "vitest";
import {
	parseRhythm,
	parseRhythmInMeter,
	acceptedRhythmCharacters,
} from "@/lib/strumAssistant/parseRhythm";
import { patternNotation } from "@/lib/strumNotation";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";
import type { Beat } from "@/lib/strumPatterns";
import { SUPPORTED_METERS, type Meter } from "@/lib/strumMeter";

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
				["D", ""],
				["D", "U"],
				["", "U"],
				["D", ""],
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
				["D", ""],
				["D", ""],
				["D", ""],
				["D", ""],
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

	describe("what is not struck", () => {
		// Nothing is invented here. The travelling hand is drawn from these cells
		// where the grid is rendered (`ghostedBeats` in strumGridLayout.ts), so a
		// cell the writer left blank comes back blank — which is what makes the
		// notation and the grid two views of one rhythm rather than two rhythms.
		it("leaves every unstruck cell a rest", () => {
			expect(beatsOf("D")).toEqual([["D"], [""], [""], [""]]);
			expect(beatsOf("D", { cellsPerBeat: 2 })).toEqual([
				["D", ""],
				["", ""],
				["", ""],
				["", ""],
			]);
		});

		it("keeps a leading rest where it was written", () => {
			expect(beatsOf("  D  D  ")).toEqual([
				["", ""],
				["D", ""],
				["", "D"],
				["", ""],
			]);
		});

		it("writes back exactly what was read", () => {
			for (const input of ["D DU UD", "DUDUDUDU", "DXUX", "D U DU", "  D  D"]) {
				expect(patternNotation(beatsOf(input))).toBe(input.trimEnd());
			}
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
			expect(result.value.bars[0].beats[2]).toEqual(["", "U"]);
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
			expect(result.value.bars[1].beats[1]).toEqual(["", "", "", ""]);
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

describe("parseRhythmInMeter", () => {
	function barOf(input: string, meter: Meter): Beat[] {
		const result = parseRhythmInMeter(input, meter);
		if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("; "));
		expect(result.value.bars).toHaveLength(1);
		return result.value.bars[0].beats;
	}

	it("reads eight cells as the eighths of a 4/4 bar", () => {
		expect(barOf("D DU UD", [4, 4])).toEqual([
			["D", ""],
			["D", "U"],
			["", "U"],
			["D", ""],
		]);
	});

	it("reads sixteen cells as sixteenths", () => {
		const beats = barOf("D".repeat(16), [4, 4]);
		expect(beats).toHaveLength(4);
		expect(beats.every((beat) => beat.length === 4)).toBe(true);
	});

	it("counts a compound bar in dotted beats", () => {
		// 6/8 is two beats of three, never six beats of one.
		const beats = barOf("DUDUDU", [6, 8]);
		expect(beats).toEqual([
			["D", "U", "D"],
			["U", "D", "U"],
		]);
	});

	it("never divides a dotted beat four ways", () => {
		// Eight cells over two beats infers four, which names no note value under
		// a dotted beat; it rounds up to the six the meter does have.
		const beats = barOf("D".repeat(8), [6, 8]);
		expect(beats).toHaveLength(2);
		expect(beats.every((beat) => beat.length === 6)).toBe(true);
	});

	it("fills a 3/4 bar in three", () => {
		const beats = barOf("DUDUDU", [3, 4]);
		expect(beats).toEqual([
			["D", "U"],
			["D", "U"],
			["D", "U"],
		]);
	});

	it("pads a short bar with rests", () => {
		const result = parseRhythmInMeter("DU", [4, 4]);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.padded).toBe(true);
		expect(result.value.bars[0].beats).toHaveLength(4);
	});

	it("rejects more cells than the meter's finest division holds", () => {
		// 4/4 tops out at four cells a beat: 17 fits into no division of it.
		const result = parseRhythmInMeter("D".repeat(17), [4, 4]);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors[0].code).toBe("too-many-cells");
	});

	it("round-trips through the written notation", () => {
		const beats = barOf("D DU UD", [4, 4]);
		expect(patternNotation(beats)).toBe("D DU UD");
	});

	it("never throws on arbitrary input", () => {
		for (const junk of ["", "🎸", "|||", "0123"]) {
			for (const meter of SUPPORTED_METERS) {
				expect(() => parseRhythmInMeter(junk, meter)).not.toThrow();
			}
		}
	});
});
