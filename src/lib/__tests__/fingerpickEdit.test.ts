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
	computeBeatLabels,
	computeBeatGroups,
	clampFret,
	measureCapacity,
	slotDurationUnits,
	usedUnits,
	remainingUnits,
	splitSlot,
	mergeSlots,
	resetMeasure,
	remapMeasure,
	type Cell,
} from "@/lib/fingerpickEdit";
import type { Duration, Measure, StringFret } from "@/lib/fingerpickTypes";

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

describe("computeBeatLabels", () => {
	const slotsOf = (durations: Duration[]) => durations.map((d) => makeEmptySlot(d));

	it("labels four quarter notes 1-4 in 4/4", () => {
		const slots = slotsOf(["quarter", "quarter", "quarter", "quarter"]);
		expect(computeBeatLabels(slots, [4, 4])).toEqual(["1", "2", "3", "4"]);
	});

	it("subdivides a beat holding two eighths in mixed quarter+eighth 4/4", () => {
		const slots = slotsOf(["quarter", "eighth", "eighth", "quarter", "quarter"]);
		expect(computeBeatLabels(slots, [4, 4])).toEqual(["1", "2", "+", "3", "4"]);
	});

	it("labels sixteenths as 1 e + a within each beat in 4/4", () => {
		const slots = slotsOf(Array<Duration>(16).fill("sixteenth"));
		expect(computeBeatLabels(slots, [4, 4])).toEqual([
			"1", "e", "+", "a",
			"2", "e", "+", "a",
			"3", "e", "+", "a",
			"4", "e", "+", "a",
		]);
	});

	it("uses eighth-note beats numbered 1-6 in 6/8", () => {
		const slots = slotsOf(Array<Duration>(6).fill("eighth"));
		expect(computeBeatLabels(slots, [6, 8])).toEqual(["1", "2", "3", "4", "5", "6"]);
	});

	it("subdivides an eighth beat into two sixteenths as 1 + in 6/8", () => {
		const slots = slotsOf(["sixteenth", "sixteenth"]);
		expect(computeBeatLabels(slots, [6, 8])).toEqual(["1", "+"]);
	});

	it("labels a whole note spanning the measure with its starting beat only", () => {
		expect(computeBeatLabels(slotsOf(["whole"]), [4, 4])).toEqual(["1"]);
	});

	it("skips the beats a half note covers, labelling only its onset", () => {
		const slots = slotsOf(["half", "quarter", "quarter"]);
		expect(computeBeatLabels(slots, [4, 4])).toEqual(["1", "3", "4"]);
	});
});

describe("computeBeatGroups", () => {
	const slotsOf = (durations: Duration[]) => durations.map((d) => makeEmptySlot(d));

	it("groups a mixed quarter+eighth measure by beat in 4/4", () => {
		const slots = slotsOf(["quarter", "eighth", "eighth", "quarter", "quarter"]);
		expect(computeBeatGroups(slots, [4, 4])).toEqual([[0], [1, 2], [3], [4]]);
	});

	it("puts a beat-spanning half note in its own group and covers no other beat", () => {
		const slots = slotsOf(["half", "quarter", "quarter"]);
		expect(computeBeatGroups(slots, [4, 4])).toEqual([[0], [1], [2]]);
	});

	it("uses eighth-note beats in 6/8", () => {
		const slots = slotsOf(["eighth", "sixteenth", "sixteenth", "eighth"]);
		expect(computeBeatGroups(slots, [6, 8])).toEqual([[0], [1, 2], [3]]);
	});
});

// ── Duration capacity + split/merge/reset/remap ─────────────────────────────

// A slot of the given duration with a fret on the top string (marks it as data).
function slotWith(duration: Duration, fret: number): ReturnType<typeof makeEmptySlot> {
	const slot = makeEmptySlot(duration);
	const strings = slot.strings.map((sf, i) =>
		i === 0 ? ({ ...sf, fret } as StringFret) : sf,
	) as ReturnType<typeof makeEmptySlot>["strings"];
	return { ...slot, strings };
}

const measuresOf = (slots: ReturnType<typeof makeEmptySlot>[]): Measure[] => [
	{ id: "m0", slots },
];

const firstFret = (measures: Measure[], slotIndex: number): number | null =>
	measures[0].slots[slotIndex].strings[0].fret;

describe("measureCapacity", () => {
	it("returns 32/24/24 for 4/4, 3/4 and 6/8", () => {
		expect(measureCapacity([4, 4])).toBe(32);
		expect(measureCapacity([3, 4])).toBe(24);
		expect(measureCapacity([6, 8])).toBe(24);
	});
});

describe("duration unit helpers", () => {
	it("slotDurationUnits maps the common durations", () => {
		expect(slotDurationUnits("whole")).toBe(32);
		expect(slotDurationUnits("quarter")).toBe(8);
		expect(slotDurationUnits("eighth")).toBe(4);
		expect(slotDurationUnits("sixteenth")).toBe(2);
		expect(slotDurationUnits("rest")).toBe(8);
	});

	it("usedUnits and remainingUnits sum against capacity", () => {
		const slots = [makeEmptySlot("quarter"), makeEmptySlot("eighth")];
		expect(usedUnits(slots)).toBe(12);
		expect(remainingUnits(slots, [4, 4])).toBe(20);
	});
});

describe("splitSlot", () => {
	it("splits a quarter into two eighths, first keeps data", () => {
		const measures = measuresOf([
			slotWith("quarter", 5),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const out = splitSlot(measures, 0, 0, "eighth", [4, 4]);
		expect(out[0].slots).toHaveLength(5);
		expect(out[0].slots[0].duration).toBe("eighth");
		expect(out[0].slots[1].duration).toBe("eighth");
		expect(firstFret(out, 0)).toBe(5);
		expect(firstFret(out, 1)).toBeNull();
	});

	it("rejects a split that would exceed measure capacity", () => {
		const measures = measuresOf([slotWith("whole", 3)]);
		// dotted-quarter (12u) does not divide a whole (32u); covering it needs 36u,
		// 4 over a full 4/4 measure — must be rejected and returned unchanged.
		const out = splitSlot(measures, 0, 0, "dotted-quarter", [4, 4]);
		expect(out).toEqual(measures);
		expect(out[0].slots).toHaveLength(1);
	});
});

describe("mergeSlots", () => {
	it("merges two eighths into a quarter without confirmation when empty", () => {
		const measures = measuresOf([
			slotWith("eighth", 2),
			makeEmptySlot("eighth"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const res = mergeSlots(measures, 0, 0, "quarter", [4, 4]);
		expect(res.type).toBe("ok");
		if (res.type === "ok") {
			expect(res.measures[0].slots).toHaveLength(4);
			expect(res.measures[0].slots[0].duration).toBe("quarter");
			expect(res.measures[0].slots[0].strings[0].fret).toBe(2);
		}
	});

	it("asks for confirmation when a discarded slot carries data", () => {
		const measures = measuresOf([
			slotWith("eighth", 2),
			slotWith("eighth", 7),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const res = mergeSlots(measures, 0, 0, "quarter", [4, 4]);
		expect(res.type).toBe("confirm");
		if (res.type === "confirm") {
			expect(res.affectedSlotCount).toBe(1);
			expect(res.pendingMeasures[0].slots).toHaveLength(4);
			expect(res.pendingMeasures[0].slots[0].strings[0].fret).toBe(2);
		}
	});
});

describe("resetMeasure", () => {
	it("applies immediately when the measure is empty", () => {
		const measures = measuresOf([makeEmptySlot("quarter"), makeEmptySlot("quarter")]);
		const res = resetMeasure(measures, 0, "eighth", [4, 4]);
		expect(res.type).toBe("ok");
		expect(res.measures[0].slots).toHaveLength(8);
		expect(res.measures[0].slots.every((s) => s.duration === "eighth")).toBe(true);
	});

	it("requests confirmation when the measure holds data", () => {
		const measures = measuresOf([slotWith("quarter", 4), makeEmptySlot("quarter")]);
		const res = resetMeasure(measures, 0, "quarter", [4, 4]);
		expect(res.type).toBe("confirm");
		expect(res.measures[0].slots).toHaveLength(4);
		expect(res.measures[0].slots.every((s) => !s.strings.some((x) => x.fret !== null))).toBe(true);
	});
});

describe("remapMeasure", () => {
	it("keeps leading data when splitting to a smaller duration", () => {
		const measures = measuresOf([
			slotWith("quarter", 6),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const out = remapMeasure(measures, 0, "eighth", [4, 4]);
		expect(out[0].slots).toHaveLength(8);
		expect(firstFret(out, 0)).toBe(6);
		expect(firstFret(out, 1)).toBeNull();
	});

	it("keeps the first slot and discards merged data when merging to a larger duration", () => {
		const measures = measuresOf([
			slotWith("eighth", 6),
			slotWith("eighth", 9),
			makeEmptySlot("eighth"),
			makeEmptySlot("eighth"),
			makeEmptySlot("eighth"),
			makeEmptySlot("eighth"),
			makeEmptySlot("eighth"),
			makeEmptySlot("eighth"),
		]);
		const out = remapMeasure(measures, 0, "quarter", [4, 4]);
		expect(out[0].slots).toHaveLength(4);
		expect(firstFret(out, 0)).toBe(6); // first eighth's data kept
		expect(firstFret(out, 1)).toBeNull(); // second eighth (9) discarded, not carried
	});
});
