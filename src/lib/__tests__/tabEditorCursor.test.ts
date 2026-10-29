import { describe, expect, it } from "vitest";
import { makeEmptySlot, moveCell, setFret, type Cell } from "@/lib/fingerpickEdit";
import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import {
	BLOCK_REASON,
	TWO_DIGIT_WINDOW_MS,
	applyNoteEdit,
	clampCell,
	editorKeyAction,
	extendSelection,
	inSelection,
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
	it("grows with Shift across a barline, from where it started", () => {
		const p = tab();
		let state = extendSelection(p, at(0, 2), null, 1);
		state = extendSelection(p, state.cursor, state.selection, 1);
		expect(state.cursor).toEqual(at(1, 0));
		expect(selectedSlots(p, state.cursor, state.selection)).toEqual([
			{ measureIndex: 0, slotIndex: 2 },
			{ measureIndex: 0, slotIndex: 3 },
			{ measureIndex: 1, slotIndex: 0 },
		]);
		// Back past the start, the run turns the other way.
		state = extendSelection(p, at(0, 2), { anchor: { measureIndex: 0, slotIndex: 2 }, head: { measureIndex: 0, slotIndex: 2 } }, -1);
		expect(selectedSlots(p, state.cursor, state.selection).map((s) => s.slotIndex)).toEqual([1, 2]);
	});

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
		expect(editorKeyAction(key("ArrowUp"))).toEqual({ kind: "string", delta: -1 });
	});

	it("reads the registry's technique keys", () => {
		expect(editorKeyAction(key("h"))).toEqual({ kind: "link", link: "hammer" });
		expect(editorKeyAction(key("P"))).toEqual({ kind: "link", link: "pull" });
		expect(editorKeyAction(key("/"))).toEqual({ kind: "link", link: "slide" });
		expect(editorKeyAction(key("m"))).toEqual({ kind: "span", span: "palmMute" });
		expect(editorKeyAction(key("l"))).toEqual({ kind: "span", span: "letRing" });
		expect(editorKeyAction(key("b"))).toEqual({ kind: "bend" });
		expect(editorKeyAction(key("V"))).toEqual({ kind: "vibrato" });
		expect(editorKeyAction(key("s"))).toEqual({ kind: "slap" });
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
});
