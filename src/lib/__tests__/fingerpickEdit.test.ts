import { describe, it, expect } from "vitest";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import {
	makeDefaultPattern,
	makeEmptySlot,
	setFret,
	setInactive,
	toggleMuted,
	setTechnique,
	moveCell,
	previousSlotFret,
	hasPreviousNoteOnString,
	setSlotsDuration,
	insertSlots,
	duplicateSlots,
	deleteSlots,
	addSlotToMeasure,
	addMeasure,
	deleteMeasure,
	clampFret,
	type Cell,
} from "@/lib/fingerpickEdit";

// A 2-measure pattern with distinct slot counts for boundary-wrap tests.
function twoMeasurePattern(): FingerpickPattern {
	return {
		id: "p",
		name: "test",
		description: "",
		bpm: 100,
		timeSignature: [4, 4],
		measures: [
			{ id: "m0", slots: [makeEmptySlot(), makeEmptySlot(), makeEmptySlot()] },
			{ id: "m1", slots: [makeEmptySlot(), makeEmptySlot()] },
		],
	};
}

describe("makeDefaultPattern", () => {
	it("creates 1 measure with 4 quarter-note slots, all strings inactive", () => {
		const p = makeDefaultPattern();
		expect(p.measures).toHaveLength(1);
		expect(p.measures[0].slots).toHaveLength(4);
		expect(p.measures[0].slots.every((s) => s.duration === "quarter")).toBe(true);
		expect(p.bpm).toBe(100);
		expect(p.timeSignature).toEqual([4, 4]);
		for (const slot of p.measures[0].slots) {
			expect(slot.strings).toHaveLength(6);
			expect(slot.strings.every((sf) => sf.fret === null && !sf.muted)).toBe(true);
		}
	});
});

describe("clampFret", () => {
	it("clamps to 0–24", () => {
		expect(clampFret(-3)).toBe(0);
		expect(clampFret(30)).toBe(24);
		expect(clampFret(12)).toBe(12);
	});
});

describe("StringFret edits", () => {
	const cell: Cell = { measureIndex: 0, slotIndex: 0, stringIndex: 5 };

	it("setFret activates the string and clears muted", () => {
		let p = makeDefaultPattern();
		p = toggleMuted(p, cell); // mute first
		p = setFret(p, cell, 5);
		const sf = p.measures[0].slots[0].strings[5];
		expect(sf.fret).toBe(5);
		expect(sf.muted).toBe(false);
	});

	it("setFret clamps out-of-range values", () => {
		const p = setFret(makeDefaultPattern(), cell, 99);
		expect(p.measures[0].slots[0].strings[5].fret).toBe(24);
	});

	it("setInactive resets the cell", () => {
		let p = setFret(makeDefaultPattern(), cell, 7);
		p = setInactive(p, cell);
		expect(p.measures[0].slots[0].strings[5]).toEqual({
			fret: null,
			technique: null,
			tied: false,
			muted: false,
		});
	});

	it("toggleMuted flips muted and clears fret", () => {
		let p = setFret(makeDefaultPattern(), cell, 7);
		p = toggleMuted(p, cell);
		expect(p.measures[0].slots[0].strings[5]).toEqual({
			fret: null,
			technique: null,
			tied: false,
			muted: true,
		});
		p = toggleMuted(p, cell);
		expect(p.measures[0].slots[0].strings[5].muted).toBe(false);
	});

	it("setTechnique writes the technique", () => {
		const p = setTechnique(setFret(makeDefaultPattern(), cell, 3), cell, "hammer-on");
		expect(p.measures[0].slots[0].strings[5].technique).toBe("hammer-on");
	});

	it("does not mutate the input pattern", () => {
		const p = makeDefaultPattern();
		const before = structuredClone(p);
		setFret(p, cell, 9);
		expect(p).toEqual(before);
	});
});

describe("moveCell navigation", () => {
	const p = twoMeasurePattern();

	it("clamps up/down within 6 strings", () => {
		expect(moveCell(p, { measureIndex: 0, slotIndex: 0, stringIndex: 0 }, "up").stringIndex).toBe(0);
		expect(
			moveCell(p, { measureIndex: 0, slotIndex: 0, stringIndex: 5 }, "down").stringIndex,
		).toBe(5);
		expect(moveCell(p, { measureIndex: 0, slotIndex: 0, stringIndex: 2 }, "up").stringIndex).toBe(1);
	});

	it("moves right within a measure", () => {
		expect(moveCell(p, { measureIndex: 0, slotIndex: 0, stringIndex: 3 }, "right")).toEqual({
			measureIndex: 0,
			slotIndex: 1,
			stringIndex: 3,
		});
	});

	it("wraps right into the next measure at slot 0", () => {
		expect(moveCell(p, { measureIndex: 0, slotIndex: 2, stringIndex: 3 }, "right")).toEqual({
			measureIndex: 1,
			slotIndex: 0,
			stringIndex: 3,
		});
	});

	it("wraps left into the previous measure's last slot", () => {
		expect(moveCell(p, { measureIndex: 1, slotIndex: 0, stringIndex: 3 }, "left")).toEqual({
			measureIndex: 0,
			slotIndex: 2,
			stringIndex: 3,
		});
	});

	it("clamps at the very first and last cells", () => {
		expect(moveCell(p, { measureIndex: 0, slotIndex: 0, stringIndex: 3 }, "left")).toEqual({
			measureIndex: 0,
			slotIndex: 0,
			stringIndex: 3,
		});
		expect(moveCell(p, { measureIndex: 1, slotIndex: 1, stringIndex: 3 }, "right")).toEqual({
			measureIndex: 1,
			slotIndex: 1,
			stringIndex: 3,
		});
	});
});

describe("previous-note lookup", () => {
	it("finds the previous slot within a measure", () => {
		let p = twoMeasurePattern();
		p = setFret(p, { measureIndex: 0, slotIndex: 0, stringIndex: 5 }, 3);
		const cell: Cell = { measureIndex: 0, slotIndex: 1, stringIndex: 5 };
		expect(previousSlotFret(p, cell)?.fret).toBe(3);
		expect(hasPreviousNoteOnString(p, cell)).toBe(true);
	});

	it("crosses the measure boundary to the previous measure's last slot", () => {
		let p = twoMeasurePattern();
		p = setFret(p, { measureIndex: 0, slotIndex: 2, stringIndex: 1 }, 7);
		const cell: Cell = { measureIndex: 1, slotIndex: 0, stringIndex: 1 };
		expect(hasPreviousNoteOnString(p, cell)).toBe(true);
	});

	it("returns false at the start of the pattern", () => {
		const p = twoMeasurePattern();
		expect(previousSlotFret(p, { measureIndex: 0, slotIndex: 0, stringIndex: 0 })).toBeNull();
		expect(hasPreviousNoteOnString(p, { measureIndex: 0, slotIndex: 0, stringIndex: 0 })).toBe(
			false,
		);
	});

	it("returns false when the previous note is muted or inactive", () => {
		let p = twoMeasurePattern();
		p = toggleMuted(p, { measureIndex: 0, slotIndex: 0, stringIndex: 5 });
		expect(hasPreviousNoteOnString(p, { measureIndex: 0, slotIndex: 1, stringIndex: 5 })).toBe(
			false,
		);
	});
});

describe("slot structural edits", () => {
	it("setSlotsDuration applies to all targets across measures", () => {
		const p = setSlotsDuration(twoMeasurePattern(), [
			{ measureIndex: 0, slotIndex: 1 },
			{ measureIndex: 1, slotIndex: 0 },
		], "eighth");
		expect(p.measures[0].slots[1].duration).toBe("eighth");
		expect(p.measures[1].slots[0].duration).toBe("eighth");
		expect(p.measures[0].slots[0].duration).toBe("quarter");
	});

	it("insertSlots before/after adds a slot at the right position", () => {
		const before = insertSlots(twoMeasurePattern(), [{ measureIndex: 0, slotIndex: 1 }], "before");
		expect(before.measures[0].slots).toHaveLength(4);
		const after = insertSlots(twoMeasurePattern(), [{ measureIndex: 0, slotIndex: 1 }], "after");
		expect(after.measures[0].slots).toHaveLength(4);
	});

	it("duplicateSlots copies a slot with a new id", () => {
		let p = twoMeasurePattern();
		p = setFret(p, { measureIndex: 0, slotIndex: 0, stringIndex: 5 }, 4);
		p = duplicateSlots(p, [{ measureIndex: 0, slotIndex: 0 }]);
		expect(p.measures[0].slots).toHaveLength(4);
		expect(p.measures[0].slots[1].strings[5].fret).toBe(4);
		expect(p.measures[0].slots[1].id).not.toBe(p.measures[0].slots[0].id);
	});

	it("deleteSlots removes targets and never empties a measure", () => {
		const p = deleteSlots(twoMeasurePattern(), [{ measureIndex: 0, slotIndex: 0 }]);
		expect(p.measures[0].slots).toHaveLength(2);

		const emptied = deleteSlots(twoMeasurePattern(), [
			{ measureIndex: 1, slotIndex: 0 },
			{ measureIndex: 1, slotIndex: 1 },
		]);
		expect(emptied.measures[1].slots).toHaveLength(1);
	});

	it("deleteSlots removes multiple targets in one measure", () => {
		const p = deleteSlots(twoMeasurePattern(), [
			{ measureIndex: 0, slotIndex: 0 },
			{ measureIndex: 0, slotIndex: 2 },
		]);
		expect(p.measures[0].slots).toHaveLength(1);
	});
});

describe("measure structural edits", () => {
	it("addSlotToMeasure appends a quarter slot", () => {
		const p = addSlotToMeasure(twoMeasurePattern(), 1);
		expect(p.measures[1].slots).toHaveLength(3);
		expect(p.measures[1].slots[2].duration).toBe("quarter");
	});

	it("addMeasure appends a 4-slot measure", () => {
		const p = addMeasure(twoMeasurePattern());
		expect(p.measures).toHaveLength(3);
		expect(p.measures[2].slots).toHaveLength(4);
	});

	it("deleteMeasure removes a measure but keeps at least one", () => {
		const p = deleteMeasure(twoMeasurePattern(), 0);
		expect(p.measures).toHaveLength(1);
		expect(p.measures[0].id).toBe("m1");

		const single = deleteMeasure(p, 0);
		expect(single.measures).toHaveLength(1);
	});
});
