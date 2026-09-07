import { describe, it, expect } from "vitest";
import { beatNotation, patternNotation } from "@/lib/strumNotation";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";

describe("beatNotation", () => {
	it("writes one character per cell", () => {
		expect(beatNotation(["D", "U"])).toBe("DU");
	});

	it("blanks an unstruck cell — it holds its column but sounds nothing", () => {
		expect(beatNotation(["D", ""])).toBe("D ");
		expect(beatNotation(["", "U"])).toBe(" U");
		expect(beatNotation(["D", "", "U", ""])).toBe("D U ");
	});

	it("keeps muted strokes", () => {
		expect(beatNotation(["D", "X", "U", "X"])).toBe("DXUX");
	});

	it("blanks a beat with nothing played", () => {
		expect(beatNotation(["", ""])).toBe("  ");
		expect(beatNotation(["", "", "", ""])).toBe("    ");
	});
});

describe("patternNotation", () => {
	it("writes the bar cell by cell, without beat separators", () => {
		expect(
			patternNotation([
				["D", ""],
				["D", "U"],
				["", "U"],
				["D", ""],
			]),
		).toBe("D DU UD");
	});

	it("drops trailing blanks but keeps a leading rest", () => {
		expect(
			patternNotation([
				["D", ""],
				["", ""],
				["", ""],
				["", ""],
			]),
		).toBe("D");
		expect(patternNotation([["", "U"], ["", ""]])).toBe(" U");
	});

	it("keeps one column per cell, so a silent beat holds its width", () => {
		expect(
			patternNotation([
				["D", ""],
				["", ""],
				["D", ""],
			]),
		).toBe("D   D");
		expect(
			patternNotation([
				["D", "", "", "U"],
				["", "", "", ""],
				["D", ""],
			]),
		).toBe("D  U    D");
	});

	it("describes every preset", () => {
		const written = PRESET_STRUM_PATTERNS.map((p) => patternNotation(p.beats));
		expect(written).toEqual([
			"D",
			"D D D D",
			"D DU UD",
			"DUDD D D",
			"D  UDUD  UDUD DU",
			"D  DUDD  DUD",
			"DUDD DUDD",
			"DXUXDXUXUXDX",
		]);
	});
});
