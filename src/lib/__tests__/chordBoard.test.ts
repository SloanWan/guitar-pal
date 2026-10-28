import { describe, it, expect } from "vitest";
import {
	BOARD_CAPO_MAX,
	BOARD_TRANSPOSE_LIMIT,
	addToBoard,
	boardParams,
	boardProgression,
	moveOnBoard,
	pageOnBoard,
	parseBoard,
	readBoardParams,
	removeFromBoard,
	serializeBoard,
	transposeChord,
	revealScrollLeft,
} from "@/lib/chordBoard";
import { MAX_BATCH_TOKENS } from "@/lib/chordBatchResolve";
import { validateBars } from "@/lib/strumBars";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";
import { patternRhythm } from "@/lib/strumRhythm";

describe("parseBoard / serializeBoard", () => {
	it("reads chords and the shape each is on, counting shapes from 1", () => {
		expect(parseBoard("C Am@2 F, G")).toEqual([
			{ token: "C", shape: 0 },
			{ token: "Am", shape: 1 },
			{ token: "F", shape: 0 },
			{ token: "G", shape: 0 },
		]);
	});

	it("round-trips", () => {
		const text = "C Am@2 F#m7b5@3 C/E";
		expect(serializeBoard(parseBoard(text))).toBe(text);
	});

	it("takes a lone @ or a bad number as part of the token", () => {
		expect(parseBoard("@2 C@x")).toEqual([
			{ token: "@2", shape: 0 },
			{ token: "C@x", shape: 0 },
		]);
	});

	it("keeps a board within the chord-list cap", () => {
		expect(parseBoard(Array.from({ length: MAX_BATCH_TOKENS + 3 }, () => "C").join(" "))).toHaveLength(MAX_BATCH_TOKENS);
	});

	it("reads nothing as an empty board", () => {
		expect(parseBoard("  ")).toEqual([]);
	});
});

describe("board edits", () => {
	const board = parseBoard("C Am F G");

	it("adds at the end, within the cap", () => {
		expect(serializeBoard(addToBoard(board, [{ token: "Em", shape: 0 }]))).toBe("C Am F G Em");
		const full = parseBoard(Array.from({ length: MAX_BATCH_TOKENS }, () => "C").join(" "));
		expect(addToBoard(full, [{ token: "D", shape: 0 }])).toHaveLength(MAX_BATCH_TOKENS);
	});

	it("removes one card", () => {
		expect(serializeBoard(removeFromBoard(board, 1))).toBe("C F G");
	});

	it("swaps a card with its neighbour, and does nothing at the ends", () => {
		expect(serializeBoard(moveOnBoard(board, 1, 1))).toBe("C F Am G");
		expect(serializeBoard(moveOnBoard(board, 0, -1))).toBe("C Am F G");
		expect(serializeBoard(moveOnBoard(board, 3, 1))).toBe("C Am F G");
	});

	it("pages a card's shape and wraps", () => {
		expect(pageOnBoard(board, 0, 1, 3)[0].shape).toBe(1);
		expect(pageOnBoard(board, 0, -1, 3)[0].shape).toBe(2);
		expect(pageOnBoard(board, 0, 1, 0)[0].shape).toBe(0);
	});
});

describe("readBoardParams / boardParams", () => {
	it("reads the cards, the transposition and the capo", () => {
		expect(readBoardParams({ board: "C Am@2", transpose: "-3", capo: "2" })).toEqual({
			items: [
				{ token: "C", shape: 0 },
				{ token: "Am", shape: 1 },
			],
			transpose: -3,
			capo: 2,
		});
	});

	it("leaves anything unreadable at its default and clamps the rest", () => {
		expect(readBoardParams({ transpose: "up", capo: "1.5" })).toEqual({ items: [], transpose: 0, capo: 0 });
		expect(readBoardParams({ transpose: "40", capo: "99" })).toMatchObject({ transpose: BOARD_TRANSPOSE_LIMIT, capo: BOARD_CAPO_MAX });
	});

	it("writes only what is not at its default, and round-trips", () => {
		expect(boardParams({ items: [], transpose: 0, capo: 0 })).toEqual({});
		const state = readBoardParams({ board: "C Am@2 F G", transpose: "2", capo: "3" });
		expect(boardParams(state)).toEqual({ board: "C Am@2 F G", transpose: "2", capo: "3" });
		expect(readBoardParams(boardParams(state))).toEqual(state);
	});
});

describe("transposeChord", () => {
	it("moves the root and spells it the way the library does", () => {
		expect(transposeChord("C", "major", 1)).toEqual({ root: "C#", suffix: "major" });
		expect(transposeChord("C", "m7", 3)).toEqual({ root: "Eb", suffix: "m7" });
		expect(transposeChord("A", "minor", -2)).toEqual({ root: "G", suffix: "minor" });
		expect(transposeChord("B", "7", 13)).toEqual({ root: "C", suffix: "7" });
	});

	it("moves a slash chord's bass with it", () => {
		expect(transposeChord("C", "/E", 2)).toEqual({ root: "D", suffix: "/F#" });
		expect(transposeChord("A", "m/C", -2)).toEqual({ root: "G", suffix: "m/Bb" });
	});

	it("is null for a root it cannot read", () => {
		expect(transposeChord("H", "major", 1)).toBeNull();
	});
});

describe("boardProgression", () => {
	const preset = PRESET_STRUM_PATTERNS[1];

	it("puts one chord a bar on the pattern's rhythm, behind the capo", () => {
		const handoff = boardProgression(
			[{ chord: { root: "G", suffix: "major", voicingId: "v2" } }, { unknown: "Hmaj7" }],
			preset.id,
			3,
		);
		expect(handoff).toMatchObject({ kind: "attach", patternId: preset.id, patternName: preset.name, capo: 3 });
		expect(handoff.bars.map((b) => [b.chord, b.unknownChord])).toEqual([
			[{ root: "G", suffix: "major", voicingId: "v2" }, undefined],
			[null, "Hmaj7"],
		]);
		expect(handoff.bars[0].beats).toEqual(patternRhythm(preset)[0]);
		expect(validateBars(handoff.bars).ok).toBe(true);
	});

	it("goes to a pattern of the player's own on a preset's rhythm, and leaves out a capo of 0", () => {
		const handoff = boardProgression([{ chord: { root: "C", suffix: "major" } }], "my-own", 0);
		expect(handoff.patternId).toBe("my-own");
		expect(handoff.capo).toBeNull();
		expect(validateBars(handoff.bars).ok).toBe(true);
	});
});

describe("revealScrollLeft", () => {
	it("leaves a row alone while the item is in view", () => {
		expect(revealScrollLeft(0, 300, 140, 132, 12)).toBeNull();
		expect(revealScrollLeft(200, 300, 300, 132, 12)).toBeNull();
	});

	it("brings an item past the right edge to the start", () => {
		expect(revealScrollLeft(0, 300, 280, 132, 12)).toBe(268);
	});

	it("brings an item scrolled past on the left back, never before the start", () => {
		expect(revealScrollLeft(400, 300, 140, 132, 12)).toBe(128);
		expect(revealScrollLeft(400, 300, 4, 132, 12)).toBe(0);
	});
});
