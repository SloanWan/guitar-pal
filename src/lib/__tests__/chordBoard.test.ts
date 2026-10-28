import { describe, it, expect } from "vitest";
import { addToBoard, moveOnBoard, pageOnBoard, parseBoard, removeFromBoard, serializeBoard } from "@/lib/chordBoard";
import { MAX_BATCH_TOKENS } from "@/lib/chordBatchResolve";

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
