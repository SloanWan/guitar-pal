import { describe, it, expect } from "vitest";
import { paddedBeatCells, ghostedBeats } from "@/lib/strumGridLayout";
import { PRESET_STRUM_PATTERNS, type Beat } from "@/lib/strumPatterns";

describe("beat padding", () => {
	it("pads one- and two-cell beats out to four columns", () => {
		expect(paddedBeatCells(["D"])).toEqual(["D", "G", "UG", "G"]);
		expect(paddedBeatCells(["D", "U"])).toEqual(["D", "G", "U", "G"]);
	});

	it("leaves triplets and sixteenths alone", () => {
		expect(paddedBeatCells(["D", "U", "D"])).toEqual(["D", "U", "D"]);
	});
});

/**
 * The ghosts the shipped presets used to carry as stored values, keyed by name.
 *
 * This is the calibration set the ghost rule was reverse-engineered from before
 * it moved into the render layer, kept here so a change to the rule has to
 * account for every pattern a player has already looked at.
 */
const PRESET_GHOSTS: Record<string, string[][]> = {
	"on the one": [["D", "UG"], ["", ""], ["", ""], ["", ""]],
	"on the beat": [["D", "UG"], ["D", "UG"], ["D", "UG"], ["D", "UG"]],
	"old faithful": [["D", "UG"], ["D", "U"], ["DG", "U"], ["D", "UG"]],
	"triplet on one": [["D", "U", "D"], ["D", "UG"], ["D", "UG"], ["D", "UG"]],
	"birds of a feather": [
		["D", "UG", "DG", "U"],
		["D", "U", "D", "UG"],
		["DG", "U", "D", "U"],
		["D", "UG", "D", "U"],
	],
	hualala: [["D", "UG", "DG"], ["D", "U", "D"], ["D", "UG", "DG"], ["D", "U", "D"]],
	"triplet on 1+3": [["D", "U", "D"], ["D", "UG"], ["D", "U", "D"], ["D", "UG"]],
	muted: [["D", "X", "U", "X"], ["D", "X", "U", "X"], ["U", "X"], ["D", "X"]],
};

describe("ghostedBeats", () => {
	it("redraws every shipped preset exactly as it was stored", () => {
		expect(PRESET_STRUM_PATTERNS).toHaveLength(Object.keys(PRESET_GHOSTS).length);
		for (const preset of PRESET_STRUM_PATTERNS) {
			expect(ghostedBeats(preset.beats), preset.name).toEqual(PRESET_GHOSTS[preset.name]);
		}
	});

	it("ghosts the gaps between strikes, and the return from the last", () => {
		expect(ghostedBeats([["D", ""], ["", "U"], ["", ""]])).toEqual([
			["D", "UG"],
			["DG", "U"],
			["DG", ""],
		]);
	});

	it("rests before the first strike", () => {
		// Nothing has happened yet: the hand is not travelling, it is waiting.
		expect(ghostedBeats([["", "U"], ["D", ""]])).toEqual([
			["", "U"],
			["D", "UG"],
		]);
	});

	it("takes a ghost's direction from its place in the beat", () => {
		expect(ghostedBeats([["D", "", "", ""], ["", "", "", "U"]])).toEqual([
			["D", "UG", "DG", "UG"],
			["DG", "UG", "DG", "U"],
		]);
	});

	it("leaves an empty bar empty", () => {
		expect(ghostedBeats([["", ""], ["", ""]])).toEqual([["", ""], ["", ""]]);
	});

	it("never moves a struck cell", () => {
		const beats: Beat[] = [["D", "X"], ["U", ""], ["", "X"]];
		const drawn = ghostedBeats(beats);
		beats.forEach((beat, i) =>
			beat.forEach((cell, j) => {
				if (cell !== "") expect(drawn[i][j]).toBe(cell);
			}),
		);
	});
});
