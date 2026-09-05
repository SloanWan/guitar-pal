import { describe, it, expect } from "vitest";
import { beatNotation, patternNotation } from "@/lib/strumNotation";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";

describe("beatNotation", () => {
	it("writes one character per cell", () => {
		expect(beatNotation(["D", "U"])).toBe("DU");
	});

	it("blanks ghost cells — they hold their column but are not struck", () => {
		expect(beatNotation(["D", "UG"])).toBe("D ");
		expect(beatNotation(["DG", "U"])).toBe(" U");
		expect(beatNotation(["D", "G", "U", "G"])).toBe("D U ");
	});

	it("writes triplet cells as ordinary strokes", () => {
		expect(beatNotation(["D3", "U3", "D3"])).toBe("DUD");
	});

	it("keeps muted strokes", () => {
		expect(beatNotation(["D", "X", "U", "X"])).toBe("DXUX");
	});

	it("blanks a beat with nothing played", () => {
		expect(beatNotation(["", ""])).toBe("  ");
		expect(beatNotation(["DG", "UG"])).toBe("  ");
	});
});

describe("patternNotation", () => {
	it("writes the bar cell by cell, without beat separators", () => {
		expect(
			patternNotation([
				["D", "UG"],
				["D", "U"],
				["DG", "U"],
				["D", "UG"],
			]),
		).toBe("D DU UD");
	});

	it("drops trailing blanks but keeps a leading rest", () => {
		expect(
			patternNotation([
				["D", "UG"],
				["", ""],
				["", ""],
				["", ""],
			]),
		).toBe("D");
		expect(patternNotation([["DG", "U"], ["", ""]])).toBe(" U");
	});

	it("keeps one column per cell, so a silent beat holds its width", () => {
		expect(
			patternNotation([
				["D", "UG"],
				["", ""],
				["D", "UG"],
			]),
		).toBe("D   D");
		expect(
			patternNotation([
				["D", "UG", "DG", "U"],
				["", "", "", ""],
				["D", "UG"],
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
