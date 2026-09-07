import { describe, it, expect } from "vitest";
import {
	canRedo,
	canUndo,
	currentEntry,
	initHistory,
	pushHistory,
	redoHistory,
	undoHistory,
} from "@/lib/editHistory";

const start = () => initHistory("a");

describe("editHistory", () => {
	it("starts on its only entry, with nowhere to go", () => {
		const h = start();
		expect(currentEntry(h)).toBe("a");
		expect(canUndo(h)).toBe(false);
		expect(canRedo(h)).toBe(false);
	});

	it("walks back and forward through committed entries", () => {
		let h = pushHistory(pushHistory(start(), "b"), "c");
		expect(currentEntry(h)).toBe("c");

		h = undoHistory(h);
		expect(currentEntry(h)).toBe("b");
		h = undoHistory(h);
		expect(currentEntry(h)).toBe("a");
		expect(canUndo(h)).toBe(false);

		h = redoHistory(h);
		expect(currentEntry(h)).toBe("b");
	});

	it("refuses to walk past either end rather than throwing", () => {
		const h = start();
		expect(undoHistory(h)).toBe(h);
		expect(redoHistory(h)).toBe(h);
	});

	it("drops a commit that changed nothing", () => {
		// Otherwise undo appears to do nothing, once per no-op edit.
		const h = pushHistory(start(), "a");
		expect(h.entries).toHaveLength(1);
		expect(canUndo(h)).toBe(false);
	});

	it("abandons the redo tail when a new edit lands after an undo", () => {
		let h = pushHistory(pushHistory(start(), "b"), "c");
		h = undoHistory(h);
		expect(canRedo(h)).toBe(true);

		h = pushHistory(h, "d");
		expect(canRedo(h)).toBe(false);
		expect(h.entries).toEqual(["a", "b", "d"]);
	});

	it("keeps the newest entries when the limit is reached", () => {
		let h = initHistory(0);
		for (let i = 1; i <= 10; i++) h = pushHistory(h, i, 4);
		expect(h.entries).toEqual([7, 8, 9, 10]);
		expect(currentEntry(h)).toBe(10);
		// The index still points at the newest entry after the trim.
		expect(h.index).toBe(3);
		expect(canRedo(h)).toBe(false);
	});

	it("still undoes correctly after a trim", () => {
		let h = initHistory(0);
		for (let i = 1; i <= 10; i++) h = pushHistory(h, i, 4);
		h = undoHistory(h);
		expect(currentEntry(h)).toBe(9);
	});

	it("never mutates the state it is given", () => {
		const h = pushHistory(start(), "b");
		const before = [...h.entries];
		pushHistory(h, "c");
		undoHistory(h);
		expect(h.entries).toEqual(before);
	});
});
