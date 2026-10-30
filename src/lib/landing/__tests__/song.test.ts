import { describe, it, expect } from "vitest";
import { patternNotation } from "@/lib/strumNotation";
import {
	SONG,
	SONG_BAR_SHAPES,
	SONG_PROGRESSION,
	SONG_RHYTHM,
	SONG_SHAPES,
	SONG_TAB,
	SONG_TAB_MEASURES,
	SONG_TURN,
	songVoicingLookup,
	shapeMidi,
	tabMeasureBar,
} from "../song";

describe("the landing song", () => {
	it("is C C Am7 Am7 Dm7 Dm7 G G behind a capo on 2", () => {
		expect(SONG_BAR_SHAPES.map((i) => SONG_SHAPES[i].name)).toEqual(["C", "C", "Am7", "Am7", "Dm7", "Dm7", "G", "G"]);
		expect(SONG_PROGRESSION.bars.map((b) => b.chord)).toEqual(SONG_BAR_SHAPES.map((i) => SONG_SHAPES[i].chord));
		expect(SONG_PROGRESSION.capo).toBe(2);
	});

	it("names what each shape sounds as a whole step up", () => {
		expect(SONG_SHAPES.map((s) => s.sounds)).toEqual(["D", "Bm7", "Em7", "A"]);
		expect(SONG_SHAPES.map((s) => s.numeral)).toEqual(["I", "vi", "ii", "V"]);
	});

	it("strums the 'birds of a feather' preset in every bar", () => {
		expect(SONG_RHYTHM).toHaveLength(1);
		expect(SONG_RHYTHM[0].flat().map((c) => c || "-").join("")).toBe("D--UDUD--UDUD-DU");
		for (const bar of SONG_PROGRESSION.bars) expect(bar.beats).toEqual(SONG_RHYTHM[0]);
		expect(patternNotation(SONG_RHYTHM[0])).toBeTruthy();
	});

	it("picks the fingerpick preset's first eight measures, untouched, at the song's tempo", () => {
		expect(SONG_TAB.measures).toHaveLength(SONG_TAB_MEASURES);
		expect(SONG_TAB.measures.map((m) => m.id)).toEqual(Array.from({ length: 8 }, (_, i) => `birds-m${i + 1}`));
		expect(SONG_TAB.capo).toBe(SONG.capo);
		expect(SONG_TAB.bpm).toBe(SONG.bpm);
		// Measure n is bar n: the picking covers the progression's eight bars, chord for chord
		// (the arrangement colours the G as Gadd11).
		const roots = SONG_TAB.measures.map((m) => m.slots[0].chord?.root);
		expect(roots).toEqual(SONG_BAR_SHAPES.map((i) => SONG_SHAPES[i].chord.root));
		expect(SONG_TAB.measures.map((_, m) => SONG_SHAPES[SONG_BAR_SHAPES[tabMeasureBar(m)]].name)).toEqual([
			"C",
			"C",
			"Am7",
			"Am7",
			"Dm7",
			"Dm7",
			"G",
			"G",
		]);
	});

	it("sounds each shape's notes as fingered, low string first", () => {
		expect(shapeMidi(SONG_SHAPES[0].voicing)).toEqual([48, 52, 55, 60, 64]); // C E G C E
		expect(shapeMidi(SONG_SHAPES[2].voicing)).toEqual([50, 57, 60, 65]); // D A C F
	});

	it("looks the shapes up without the library", async () => {
		expect(await songVoicingLookup({ root: "D", suffix: "m7" })).toEqual([SONG_SHAPES[2].voicing]);
		expect(await songVoicingLookup({ root: "F", suffix: "major" })).toBeNull();
	});

	it("is read by the real Strum reader into a proposal of the same song", () => {
		const proposal = SONG_TURN.proposal;
		expect(proposal).toBeDefined();
		expect(JSON.stringify(proposal)).toContain('"capo":2');
		expect(SONG_TURN.text.length).toBeGreaterThan(0);
	});
});
