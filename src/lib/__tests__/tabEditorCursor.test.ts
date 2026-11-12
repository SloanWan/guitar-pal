import { describe, expect, it } from "vitest";
import { makeEmptySlot, moveCell, setFret, type Cell } from "@/lib/fingerpickEdit";
import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import {
	readFretEntry,
	pressFretPad,
	BLOCK_REASON,
	TWO_DIGIT_WINDOW_MS,
	applyNoteEdit,
	clampCell,
	applyBlockEdit,
	blockCells,
	blockNotes,
	clearBlock,
	effectOnNotes,
	editorKeyAction,
	growBlock,
	inSelection,
	moveBlock,
	selectTo,
	selectedSlots,
	slotAtOrder,
	slotOrder,
	stepSlot,
	stepString,
	typeDigit,
	type KeyPress,
} from "@/lib/tabEditorCursor";

function measure(id: string, slots: number): Measure {
	return { id, slots: Array.from({ length: slots }, () => makeEmptySlot("quarter")) };
}

/** Two bars of four quarters, the second bar three. */
function tab(): FingerpickPattern {
	return { id: "t", name: "T", bpm: 90, timeSignature: [4, 4], measures: [measure("m1", 4), measure("m2", 3)] };
}

const at = (measureIndex: number, slotIndex: number, stringIndex = 2): Cell => ({ measureIndex, slotIndex, stringIndex });
const key = (k: string, mods: Partial<KeyPress> = {}): KeyPress => ({
	key: k,
	shiftKey: false,
	metaKey: false,
	ctrlKey: false,
	altKey: false,
	...mods,
});

describe("slots in order", () => {
	it("counts across bars and back", () => {
		const p = tab();
		expect(slotOrder(p, at(1, 2))).toBe(6);
		expect(slotAtOrder(p, 6)).toEqual({ measureIndex: 1, slotIndex: 2 });
		expect(slotAtOrder(p, 99)).toEqual({ measureIndex: 1, slotIndex: 2 });
		expect(slotAtOrder(p, -3)).toEqual({ measureIndex: 0, slotIndex: 0 });
	});

	it("steps across a barline and stops at the ends, as the grid's arrows did", () => {
		const p = tab();
		for (const cell of [at(0, 3), at(1, 0), at(0, 0), at(1, 2)]) {
			expect(stepSlot(p, cell, 1)).toEqual(moveCell(p, cell, "right"));
			expect(stepSlot(p, cell, -1)).toEqual(moveCell(p, cell, "left"));
		}
		expect(stepString(at(0, 0, 0), -1).stringIndex).toBe(0);
		expect(stepString(at(0, 0, 5), 1).stringIndex).toBe(5);
		expect(stepString(at(0, 0, 2), 1)).toEqual(moveCell(p, at(0, 0, 2), "down"));
	});

	it("keeps the cursor on the tab after slots or bars go", () => {
		const p = tab();
		expect(clampCell(p, at(4, 9, 3))).toEqual(at(1, 2, 3));
	});
});

describe("selection", () => {
	it("Shift-click runs from the cursor to the clicked slot; no selection is the cursor's slot", () => {
		const p = tab();
		const { selection } = selectTo(at(1, 1), null, at(0, 3, 4));
		expect(inSelection(p, selection, { measureIndex: 0, slotIndex: 3 })).toBe(true);
		expect(inSelection(p, selection, { measureIndex: 1, slotIndex: 1 })).toBe(true);
		expect(inSelection(p, selection, { measureIndex: 1, slotIndex: 2 })).toBe(false);
		expect(selectedSlots(p, at(1, 1), null)).toEqual([{ measureIndex: 1, slotIndex: 1 }]);
	});
});

describe("typeDigit", () => {
	const cell = at(0, 0);
	it("joins 1 then 2 inside the window into 12", () => {
		const first = typeDigit(null, cell, 1, 1000);
		expect(first).toEqual({ fret: 1, pending: { cell, digit: 1, at: 1000 } });
		expect(typeDigit(first.pending, cell, 2, 1000 + TWO_DIGIT_WINDOW_MS - 1)).toEqual({ fret: 12, pending: null });
	});

	it("starts over when the two would pass fret 24, or the window has closed", () => {
		expect(typeDigit({ cell, digit: 3, at: 0 }, cell, 0, 10).fret).toBe(0);
		expect(typeDigit({ cell, digit: 2, at: 0 }, cell, 5, 10)).toEqual({ fret: 5, pending: null });
		expect(typeDigit({ cell, digit: 1, at: 0 }, cell, 2, TWO_DIGIT_WINDOW_MS).fret).toBe(2);
	});

	it("waits only after a 1 or a 2, and only on the same cell", () => {
		expect(typeDigit(null, cell, 0, 0).pending).toBeNull();
		expect(typeDigit(null, cell, 3, 0).pending).toBeNull();
		expect(typeDigit(null, cell, 2, 0).pending).not.toBeNull();
		expect(typeDigit({ cell: at(0, 1), digit: 1, at: 0 }, cell, 2, 10).fret).toBe(2);
	});
});

describe("editorKeyAction", () => {
	it("reads arrows, Tab and Shift", () => {
		expect(editorKeyAction(key("ArrowRight"))).toEqual({ kind: "slot", delta: 1, extend: false });
		expect(editorKeyAction(key("ArrowLeft", { shiftKey: true }))).toEqual({ kind: "slot", delta: -1, extend: true });
		expect(editorKeyAction(key("Tab"))).toEqual({ kind: "slot", delta: 1, extend: false });
		expect(editorKeyAction(key("Tab", { shiftKey: true }))).toEqual({ kind: "slot", delta: -1, extend: false });
		expect(editorKeyAction(key("ArrowUp"))).toEqual({ kind: "string", delta: -1, extend: false });
		expect(editorKeyAction(key("ArrowDown", { shiftKey: true }))).toEqual({ kind: "string", delta: 1, extend: true });
	});

	it("reads the registry's technique keys", () => {
		expect(editorKeyAction(key("h"))).toEqual({ kind: "link", link: "hammer" });
		expect(editorKeyAction(key("P"))).toEqual({ kind: "link", link: "pull" });
		expect(editorKeyAction(key("/"))).toEqual({ kind: "link", link: "slide" });
		expect(editorKeyAction(key("m"))).toEqual({ kind: "span", span: "palmMute" });
		expect(editorKeyAction(key("l"))).toEqual({ kind: "span", span: "letRing" });
		expect(editorKeyAction(key("b"))).toEqual({ kind: "bend" });
		expect(editorKeyAction(key("V"))).toEqual({ kind: "vibrato" });
		expect(editorKeyAction(key("s"))).toEqual({ kind: "link", link: "slide" });
		expect(editorKeyAction(key("t"))).toEqual({ kind: "link", link: "tie" });
		expect(editorKeyAction(key("R"))).toEqual({ kind: "rest" });
		expect(editorKeyAction(key("."))).toEqual({ kind: "dot" });
		expect(editorKeyAction(key("x"))).toEqual({ kind: "mute" });
	});

	it("reads ⌘Z / ⌘⇧Z and leaves other chords alone", () => {
		expect(editorKeyAction(key("z", { metaKey: true }))).toEqual({ kind: "undo" });
		expect(editorKeyAction(key("Z", { ctrlKey: true, shiftKey: true }))).toEqual({ kind: "redo" });
		expect(editorKeyAction(key("c", { metaKey: true }))).toBeNull();
		expect(editorKeyAction(key("7", { altKey: true }))).toBeNull();
		expect(editorKeyAction(key("q"))).toBeNull();
	});
});

describe("applyNoteEdit", () => {
	const strings = (p: FingerpickPattern, m: number, s: number) => p.measures[m].slots[s].strings;

	it("says why a blocked technique cannot go on", () => {
		const p = setFret(tab(), at(0, 0), 3);
		expect(applyNoteEdit(p, at(0, 0), [], { kind: "link", link: "hammer" })).toEqual({
			blocked: BLOCK_REASON["no-previous-note"],
		});
		const open = setFret(tab(), at(0, 0), 0);
		expect(applyNoteEdit(open, at(0, 0), [], { kind: "bend" })).toEqual({ blocked: BLOCK_REASON["open-string"] });
		expect(applyNoteEdit(tab(), at(0, 0), [], { kind: "vibrato" })).toEqual({ blocked: BLOCK_REASON["no-note"] });
	});

	it("puts a hammer-on on a note reached from a lower fret", () => {
		const p = setFret(setFret(tab(), at(0, 0), 2), at(0, 1), 4);
		const result = applyNoteEdit(p, at(0, 1), [], { kind: "link", link: "hammer" });
		if (!("pattern" in result)) throw new Error("blocked");
		expect(strings(result.pattern, 0, 1)[2].link).toEqual({ kind: "hammer" });
	});

	it("clears the note, or every slot of a run", () => {
		let p = setFret(setFret(tab(), at(0, 0, 1), 3), at(0, 0, 4), 2);
		p = setFret(p, at(0, 1, 0), 5);
		const one = applyNoteEdit(p, at(0, 0, 1), [], { kind: "clear" });
		if (!("pattern" in one)) throw new Error("blocked");
		expect(strings(one.pattern, 0, 0)[1].fret).toBeNull();
		expect(strings(one.pattern, 0, 0)[4].fret).toBe(2);
		const run = [
			{ measureIndex: 0, slotIndex: 0 },
			{ measureIndex: 0, slotIndex: 1 },
		];
		const all = applyNoteEdit(p, at(0, 0, 1), run, { kind: "clear" });
		if (!("pattern" in all)) throw new Error("blocked");
		expect(strings(all.pattern, 0, 0).every((sf) => sf.fret === null)).toBe(true);
		expect(strings(all.pattern, 0, 1)[0].fret).toBeNull();
	});

	it("lays a palm mute over the run, and slaps every slot of it", () => {
		const run = [
			{ measureIndex: 0, slotIndex: 3 },
			{ measureIndex: 1, slotIndex: 0 },
		];
		const pm = applyNoteEdit(tab(), at(0, 3), run, { kind: "span", span: "palmMute" });
		if (!("pattern" in pm)) throw new Error("blocked");
		expect(pm.pattern.spans).toHaveLength(1);
		expect(pm.pattern.spans?.[0].kind).toBe("palmMute");
		const slap = applyNoteEdit(tab(), at(0, 3), run, { kind: "slap" });
		if (!("pattern" in slap)) throw new Error("blocked");
		expect(slap.pattern.measures[0].slots[3].percussion).toEqual({ kind: "slap" });
		expect(slap.pattern.measures[1].slots[0].percussion).toEqual({ kind: "slap" });
		const off = applyNoteEdit(slap.pattern, at(0, 3), run, { kind: "slap" });
		if (!("pattern" in off)) throw new Error("blocked");
		expect(off.pattern.measures[0].slots[3].percussion).toBeUndefined();
	});

	it("rests every slot of the run, and lets them sound again", () => {
		const run = [
			{ measureIndex: 0, slotIndex: 0 },
			{ measureIndex: 0, slotIndex: 1 },
		];
		const p = setFret(tab(), at(0, 0), 3);
		const rest = applyNoteEdit(p, at(0, 0), run, { kind: "rest" });
		if (!("pattern" in rest)) throw new Error("blocked");
		expect(rest.pattern.measures[0].slots[0].isRest).toBe(true);
		expect(rest.pattern.measures[0].slots[1].isRest).toBe(true);
		expect(rest.pattern.measures[0].slots[0].strings.every((sf) => sf.fret === null)).toBe(true);
		expect(rest.pattern.measures[0].slots[0].duration).toBe(p.measures[0].slots[0].duration);
		const back = applyNoteEdit(rest.pattern, at(0, 0), run, { kind: "rest" });
		if (!("pattern" in back)) throw new Error("blocked");
		expect(back.pattern.measures[0].slots[0].isRest).toBeUndefined();
		expect(back.pattern.measures[0].slots[1].isRest).toBeUndefined();
	});
});

describe("a block of cells (#437)", () => {
	const fret = (p: FingerpickPattern, c: Cell) => p.measures[c.measureIndex].slots[c.slotIndex].strings[c.stringIndex].fret;
	const notes = () => {
		let p = tab();
		p = setFret(p, at(0, 3, 1), 5);
		p = setFret(p, at(1, 0, 2), 7);
		return p;
	};

	it("is the strings × slots between two cells, across a barline", () => {
		const cells = blockCells(tab(), { anchor: at(0, 3, 2), head: at(1, 0, 1) });
		expect(cells).toEqual([at(0, 3, 1), at(0, 3, 2), at(1, 0, 1), at(1, 0, 2)]);
	});

	it("grows from where it started with Shift+arrows", () => {
		const b = growBlock(tab(), at(0, 1), null, "string", 1);
		expect(b).toEqual({ anchor: at(0, 1), head: at(0, 1, 3) });
		expect(growBlock(tab(), b.head, b, "slot", 1)).toEqual({ anchor: at(0, 1), head: at(0, 2, 3) });
	});

	it("moves its notes a string together, frets as written, block and cursor with them", () => {
		const block = { anchor: at(0, 3, 1), head: at(1, 0, 2) };
		const moved = moveBlock(notes(), block, at(1, 0, 2), "string", 1);
		if ("blocked" in moved) throw new Error(moved.blocked);
		expect(fret(moved.pattern, at(0, 3, 2))).toBe(5);
		expect(fret(moved.pattern, at(1, 0, 3))).toBe(7);
		expect(fret(moved.pattern, at(0, 3, 1))).toBeNull();
		expect(moved.block).toEqual({ anchor: at(0, 3, 2), head: at(1, 0, 3) });
		expect(moved.cursor).toEqual(at(1, 0, 3));
	});

	it("moves its notes a slot across a barline", () => {
		const moved = moveBlock(notes(), { anchor: at(0, 3, 1), head: at(0, 3, 1) }, at(0, 3, 1), "slot", 1);
		if ("blocked" in moved) throw new Error(moved.blocked);
		expect(fret(moved.pattern, at(1, 0, 1))).toBe(5);
		expect(fret(moved.pattern, at(0, 3, 1))).toBeNull();
	});

	it("refuses a move off the tab or onto a note left behind", () => {
		const p = setFret(notes(), at(0, 3, 0), 1);
		expect(moveBlock(p, { anchor: at(0, 3, 0), head: at(0, 3, 0) }, at(0, 3, 0), "string", -1)).toEqual({ blocked: "A note is already on the high e string" });
		expect(moveBlock(p, { anchor: at(0, 3, 1), head: at(0, 3, 1) }, at(0, 3, 1), "string", -1)).toEqual({ blocked: "A note that is not selected is in the way" });
		expect(moveBlock(tab(), { anchor: at(0, 0), head: at(0, 1) }, at(0, 0), "slot", 1)).toEqual({ blocked: "No notes in the selection to move" });
	});

	it("is emptied by Backspace", () => {
		const cleared = clearBlock(notes(), { anchor: at(0, 3, 0), head: at(1, 0, 5) });
		expect(fret(cleared, at(0, 3, 1))).toBeNull();
		expect(fret(cleared, at(1, 0, 2))).toBeNull();
	});
});

describe("an edit over a block's notes (#437)", () => {
	const note = (p: FingerpickPattern, c: Cell) => p.measures[c.measureIndex].slots[c.slotIndex].strings[c.stringIndex];
	// Three notes on the G string, the middle one higher: a hammer reaches it, not the last.
	const run = () => {
		let p = tab();
		p = setFret(p, at(0, 0), 5);
		p = setFret(p, at(0, 1), 7);
		p = setFret(p, at(0, 2), 5);
		return p;
	};
	const block = { anchor: at(0, 0), head: at(0, 2) };

	it("puts an effect on every note, and takes it off all when the lead has it", () => {
		const on = applyBlockEdit(run(), block, at(0, 0), { kind: "vibrato" });
		if (!("pattern" in on)) throw new Error(on.blocked);
		expect(blockNotes(on.pattern, block).every((c) => note(on.pattern, c).effects?.vibrato)).toBe(true);
		const accent = effectOnNotes(run(), blockNotes(run(), block), "accent", true);
		expect(accent.skipped).toBe(0);
		expect(blockNotes(accent.pattern, block).every((c) => note(accent.pattern, c).effects?.accent)).toBe(true);
	});

	it("leaves out a note a link cannot reach, and says how many", () => {
		const done = applyBlockEdit(run(), block, at(0, 1), { kind: "link", link: "hammer" });
		if (!("pattern" in done)) throw new Error(done.blocked);
		expect(note(done.pattern, at(0, 1)).link).toEqual({ kind: "hammer" });
		expect(note(done.pattern, at(0, 0)).link).toBeUndefined();
		expect(done.skipped).toBe(2);
	});

	it("writes an x on every cell, and clears them when all are x already", () => {
		const x = applyBlockEdit(tab(), { anchor: at(0, 0, 4), head: at(0, 1, 5) }, at(0, 0, 4), { kind: "mute" });
		if (!("pattern" in x)) throw new Error(x.blocked);
		expect(blockCells(x.pattern, { anchor: at(0, 0, 4), head: at(0, 1, 5) }).every((c) => note(x.pattern, c).muted)).toBe(true);
		const off = applyBlockEdit(x.pattern, { anchor: at(0, 0, 4), head: at(0, 1, 5) }, at(0, 0, 4), { kind: "mute" });
		if (!("pattern" in off)) throw new Error(off.blocked);
		expect(note(off.pattern, at(0, 1, 5)).muted).toBe(false);
	});
});

describe("readFretEntry (#479)", () => {
	it("takes a 0 or a 3–9 as a whole fret", () => {
		expect(readFretEntry("0")).toEqual({ text: "0", fret: 0, done: true });
		expect(readFretEntry("7")).toEqual({ text: "7", fret: 7, done: true });
	});

	it("lets a 1 or a 2 wait for a second digit", () => {
		expect(readFretEntry("1")).toEqual({ text: "1", fret: 1, done: false });
		expect(readFretEntry("2")).toEqual({ text: "2", fret: 2, done: false });
		expect(readFretEntry("12")).toEqual({ text: "12", fret: 12, done: true });
		expect(readFretEntry("24")).toEqual({ text: "24", fret: 24, done: true });
	});

	it("drops a second digit that would pass the neck", () => {
		expect(readFretEntry("25")).toEqual({ text: "2", fret: 2, done: false });
	});

	it("ignores anything but digits, and keeps at most two", () => {
		expect(readFretEntry("")).toEqual({ text: "", fret: null, done: false });
		expect(readFretEntry("x")).toEqual({ text: "", fret: null, done: false });
		expect(readFretEntry(" 1a5")).toEqual({ text: "15", fret: 15, done: true });
		expect(readFretEntry("123")).toEqual({ text: "12", fret: 12, done: true });
	});
});

describe("pressFretPad (#487)", () => {
	it("writes a whole fret at once and moves on", () => {
		expect(pressFretPad("", 7, null)).toEqual({ text: "", write: { fret: 7, advance: true } });
		expect(pressFretPad("", 0, null)).toEqual({ text: "", write: { fret: 0, advance: true } });
		expect(pressFretPad("1", 2, null)).toEqual({ text: "", write: { fret: 12, advance: true } });
	});

	it("holds a 1 or a 2 for a second digit, and drops one past the neck", () => {
		expect(pressFretPad("", 1, null)).toEqual({ text: "1" });
		expect(pressFretPad("", 2, null)).toEqual({ text: "2" });
		expect(pressFretPad("2", 5, null)).toEqual({ text: "2" });
	});

	it("Done writes what was typed, else the offered fret, else closes", () => {
		expect(pressFretPad("1", "done", 3)).toEqual({ text: "", write: { fret: 1, advance: true } });
		expect(pressFretPad("", "done", 3)).toEqual({ text: "", write: { fret: 3, advance: true } });
		expect(pressFretPad("", "done", null)).toEqual({ text: "", close: true });
	});

	it("Backspace takes back a digit, and with none clears the note", () => {
		expect(pressFretPad("1", "back", null)).toEqual({ text: "" });
		expect(pressFretPad("", "back", null)).toEqual({ text: "", clear: true });
	});
});
