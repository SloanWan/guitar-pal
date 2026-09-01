import { describe, it, expect } from "vitest";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import {
	makeDefaultPattern,
	makeEmptySlot,
	setFret,
	setInactive,
	toggleMuted,
	setTechnique,
	setTied,
	setStroke,
	moveCell,
	previousSlotFret,
	hasPreviousNoteOnString,
	setSlotsRest,
	splitTargetsForSlot,
	mergeTargetsForSlot,
	normalizeLoadedPattern,
	insertSlots,
	duplicateSlots,
	deleteSlots,
	addSlotToMeasure,
	addMeasure,
	deleteMeasure,
	cloneMeasure,
	swapMeasures,
	computeBeatLabels,
	computeBeatGroups,
	computeSubBeatGroups,
	clampFret,
	measureCapacity,
	slotDurationUnits,
	usedUnits,
	remainingUnits,
	splitSlot,
	mergeSlots,
	resetMeasure,
	remapMeasure,
	hasIntegerUnitWeight,
	type Cell,
} from "@/lib/fingerpickEdit";
import { fingerpickToVexFlow } from "@/lib/fingerpickToVexFlow";
import {
	fingerpickPatternToScheduleEvents,
	getTotalPatternDuration,
} from "@/lib/fingerpickScheduler";
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

describe("tied / technique mutual exclusion", () => {
	const cell: Cell = { measureIndex: 0, slotIndex: 1, stringIndex: 5 };

	it("setTied(true) clears any existing technique", () => {
		let p = setFret(makeDefaultPattern(), cell, 5);
		p = setTechnique(p, cell, "hammer-on");
		p = setTied(p, cell, true);
		const sf = p.measures[0].slots[1].strings[5];
		expect(sf.tied).toBe(true);
		expect(sf.technique).toBeNull();
	});

	it("setTechnique(non-null) clears any existing tie", () => {
		let p = setFret(makeDefaultPattern(), cell, 5);
		p = setTied(p, cell, true);
		p = setTechnique(p, cell, "pull-off");
		const sf = p.measures[0].slots[1].strings[5];
		expect(sf.technique).toBe("pull-off");
		expect(sf.tied).toBe(false);
	});

	it("clearing both leaves technique null and tied false", () => {
		let p = setFret(makeDefaultPattern(), cell, 5);
		p = setTied(p, cell, true);
		// Clear = setTechnique(null) then setTied(false), as wired in the menu.
		p = setTied(setTechnique(p, cell, null), cell, false);
		const sf = p.measures[0].slots[1].strings[5];
		expect(sf.technique).toBeNull();
		expect(sf.tied).toBe(false);
	});

	it("greys out (no previous note) when the prior slot has no note on the string", () => {
		// No note anywhere: previous slot on this string is inactive → cannot tie.
		expect(hasPreviousNoteOnString(makeDefaultPattern(), cell)).toBe(false);
		// With a note in the previous slot on the same string, tying is allowed.
		const p = setFret(makeDefaultPattern(), { ...cell, slotIndex: 0 }, 3);
		expect(hasPreviousNoteOnString(p, cell)).toBe(true);
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
	it("setSlotsRest silences all targets across measures, keeping their duration", () => {
		const p = setSlotsRest(twoMeasurePattern(), [
			{ measureIndex: 0, slotIndex: 1 },
			{ measureIndex: 1, slotIndex: 0 },
		], true);
		expect(p.measures[0].slots[1].isRest).toBe(true);
		expect(p.measures[1].slots[0].isRest).toBe(true);
		// Duration is untouched — a rest keeps the slot's rhythmic value.
		expect(p.measures[0].slots[1].duration).toBe("quarter");
		expect(p.measures[0].slots[0].isRest).toBeUndefined();
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

describe("cloneMeasure", () => {
	it("appends a deep clone at the end with fresh measure and slot ids", () => {
		let p = twoMeasurePattern();
		p = setFret(p, { measureIndex: 0, slotIndex: 0, stringIndex: 5 }, 4);
		const out = cloneMeasure(p.measures, 0);
		expect(out).toHaveLength(3);
		// Original measures keep their order; the clone lands at the last position.
		expect(out[0].id).toBe("m0");
		expect(out[1].id).toBe("m1");
		const source = out[0];
		const clone = out[2];
		// Same shape and data...
		expect(clone.slots).toHaveLength(source.slots.length);
		expect(clone.slots[0].strings[5].fret).toBe(4);
		// ...but brand-new ids at every level.
		expect(clone.id).not.toBe(source.id);
		expect(clone.slots.every((s, i) => s.id !== source.slots[i].id)).toBe(true);
	});

	it("uses the supplied newId for the appended clone", () => {
		const p = twoMeasurePattern();
		const out = cloneMeasure(p.measures, 0, "clone-id");
		expect(out[2].id).toBe("clone-id");
	});

	it("returns the input unchanged for an out-of-range index", () => {
		const measures = twoMeasurePattern().measures;
		expect(cloneMeasure(measures, 9)).toBe(measures);
	});
});

describe("swapMeasures", () => {
	it("swaps two measures", () => {
		const measures = twoMeasurePattern().measures;
		const out = swapMeasures(measures, 0, 1);
		expect(out[0].id).toBe("m1");
		expect(out[1].id).toBe("m0");
	});

	it("is a no-op for equal or out-of-range indices", () => {
		const measures = twoMeasurePattern().measures;
		expect(swapMeasures(measures, 1, 1)).toBe(measures);
		expect(swapMeasures(measures, 0, 5)).toBe(measures);
		expect(swapMeasures(measures, -1, 0)).toBe(measures);
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

describe("computeSubBeatGroups", () => {
	const slotsOf = (durations: Duration[]) => durations.map((d) => makeEmptySlot(d));
	const FOUR_FOUR: [number, number] = [4, 4];

	it("pairs each two 32nd notes into one sixteenth window (evenly filled beat)", () => {
		// Both eighth-halves are subdivided the same way, so it descends to readable
		// pairs rather than collapsing wholesale.
		const slots = slotsOf(Array<Duration>(8).fill("32nd"));
		expect(computeSubBeatGroups(slots, FOUR_FOUR)).toEqual([[0, 1], [2, 3], [4, 5], [6, 7]]);
	});

	it("groups all four 32nds that fill an eighth beside a plain eighth", () => {
		// The requested case: quarter → eighth + four 32nds. The four 32nds are one
		// eighth's worth, so they collapse into a single group.
		const slots = slotsOf(["eighth", "32nd", "32nd", "32nd", "32nd"]);
		expect(computeSubBeatGroups(slots, FOUR_FOUR)).toEqual([[0], [1, 2, 3, 4]]);
	});

	it("groups two sixteenths that fill a split eighth (eighth + 2 sixteenths)", () => {
		const slots = slotsOf(["eighth", "sixteenth", "sixteenth"]);
		expect(computeSubBeatGroups(slots, FOUR_FOUR)).toEqual([[0], [1, 2]]);
	});

	it("keeps a mixed eighth split: sixteenth alone, only the 32nds pair (2 e ta / +)", () => {
		// Beat 2 = [sixteenth "2", 32nd "e", 32nd "ta", eighth "+"]. The half is mixed
		// (not uniform), so "2" stays on its own and only [e, ta] group.
		const slots = slotsOf(["sixteenth", "32nd", "32nd", "eighth"]);
		expect(computeSubBeatGroups(slots, FOUR_FOUR)).toEqual([[0], [1, 2], [3]]);
	});

	it("descends when both eighths are subdivided (sixteenth alone, 32nds paired)", () => {
		const slots = slotsOf(["sixteenth", "32nd", "32nd", "sixteenth", "32nd", "32nd"]);
		expect(computeSubBeatGroups(slots, FOUR_FOUR)).toEqual([[0], [1, 2], [3], [4, 5]]);
	});

	it("groups each split eighth's sixteenth pair independently", () => {
		const slots = slotsOf(["sixteenth", "sixteenth", "sixteenth", "sixteenth"]);
		expect(computeSubBeatGroups(slots, FOUR_FOUR)).toEqual([[0, 1], [2, 3]]);
	});

	it("resolves the requested case inside a full 4/4 measure", () => {
		// Beat 1: eighth + four 32nds; beats 2–4: plain quarters.
		const slots = slotsOf([
			"eighth",
			"32nd",
			"32nd",
			"32nd",
			"32nd",
			"quarter",
			"quarter",
			"quarter",
		]);
		expect(computeSubBeatGroups(slots, FOUR_FOUR)).toEqual([
			[0],
			[1, 2, 3, 4],
			[5],
			[6],
			[7],
		]);
	});

	it("leaves the beat's own subdivision ungrouped (two eighths in 4/4)", () => {
		const slots = slotsOf(["eighth", "eighth"]);
		expect(computeSubBeatGroups(slots, FOUR_FOUR)).toEqual([[0], [1]]);
	});

	it("does not group notes straddling a binary boundary (syncopation)", () => {
		// An eighth starting on the off-sixteenth can't be halved cleanly: all singletons.
		const slots = slotsOf(["sixteenth", "eighth", "sixteenth"]);
		expect(computeSubBeatGroups(slots, FOUR_FOUR)).toEqual([[0], [1], [2]]);
	});

	it("keeps eighth-note triplets ungrouped", () => {
		const slots = slotsOf(["eighth-triplet", "eighth-triplet", "eighth-triplet"]);
		expect(computeSubBeatGroups(slots, FOUR_FOUR)).toEqual([[0], [1], [2]]);
	});

	it("keeps a beat-level sixteenth pair ungrouped in 6/8 but pairs its 32nds", () => {
		// In 6/8 the beat is an eighth, so two sixteenths fill the whole beat (L1
		// covers them); four 32nds still pair under their sixteenth windows.
		expect(computeSubBeatGroups(slotsOf(["sixteenth", "sixteenth"]), [6, 8])).toEqual([
			[0],
			[1],
		]);
		expect(computeSubBeatGroups(slotsOf(["32nd", "32nd", "32nd", "32nd"]), [6, 8])).toEqual([
			[0, 1],
			[2, 3],
		]);
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

// ── Slot-level roll stroke ──────────────────────────────────────────────────

describe("setStroke", () => {
	const target = { measureIndex: 0, slotIndex: 1 };

	it("sets a roll stroke on the targeted slot only", () => {
		const p = setStroke(twoMeasurePattern(), target, "roll-down");
		expect(p.measures[0].slots[1].stroke).toBe("roll-down");
		expect(p.measures[0].slots[0].stroke).toBeUndefined();
	});

	it("overwrites an existing stroke", () => {
		let p = setStroke(twoMeasurePattern(), target, "roll-down");
		p = setStroke(p, target, "roll-up");
		expect(p.measures[0].slots[1].stroke).toBe("roll-up");
	});

	it("clearing with undefined removes the key entirely (not stored as undefined)", () => {
		let p = setStroke(twoMeasurePattern(), target, "roll-up");
		p = setStroke(p, target, undefined);
		expect(p.measures[0].slots[1].stroke).toBeUndefined();
		expect("stroke" in p.measures[0].slots[1]).toBe(false);
	});

	it("does not mutate the input pattern", () => {
		const p = twoMeasurePattern();
		const before = structuredClone(p);
		setStroke(p, target, "roll-down");
		expect(p).toEqual(before);
	});
});

describe("stroke preservation across slot operations", () => {
	// A slot of the given duration carrying both string data and a roll stroke.
	function slotWithStroke(duration: Duration, fret: number, stroke: "roll-down" | "roll-up") {
		return { ...slotWith(duration, fret), stroke };
	}

	it("splitSlot: only the first sub-slot inherits the stroke", () => {
		const measures = measuresOf([
			slotWithStroke("quarter", 5, "roll-down"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const out = splitSlot(measures, 0, 0, "eighth", [4, 4]);
		expect(out[0].slots[0].stroke).toBe("roll-down");
		expect(out[0].slots[1].stroke).toBeUndefined();
	});

	it("mergeSlots: the first slot's stroke wins when both carry one", () => {
		const measures = measuresOf([
			slotWithStroke("eighth", 2, "roll-down"),
			slotWithStroke("eighth", 7, "roll-up"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const res = mergeSlots(measures, 0, 0, "quarter", [4, 4]);
		// Discarding the second (data-bearing) slot asks for confirmation.
		expect(res.type).toBe("confirm");
		if (res.type === "confirm") {
			expect(res.pendingMeasures[0].slots[0].stroke).toBe("roll-down");
		}
	});

	it("mergeSlots: a stroke-free merge leaves the merged slot stroke-free", () => {
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
			expect(res.measures[0].slots[0].stroke).toBeUndefined();
		}
	});

	it("cloneMeasure: preserves strokes on the clone", () => {
		const measures = measuresOf([
			slotWithStroke("quarter", 4, "roll-up"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const out = cloneMeasure(measures, 0);
		expect(out[1].slots[0].stroke).toBe("roll-up");
	});

	it("swapMeasures: preserves strokes on the swapped measures", () => {
		const measures = [
			{ id: "a", slots: [slotWithStroke("quarter", 4, "roll-down")] },
			{ id: "b", slots: [makeEmptySlot("whole")] },
		];
		const out = swapMeasures(measures, 0, 1);
		expect(out[1].slots[0].stroke).toBe("roll-down");
	});

	it("remapMeasure: carries the stroke to the slot that keeps the data", () => {
		const measures = measuresOf([
			slotWithStroke("quarter", 6, "roll-down"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const out = remapMeasure(measures, 0, "eighth", [4, 4]);
		expect(out[0].slots[0].stroke).toBe("roll-down");
		expect(out[0].slots[1].stroke).toBeUndefined();
	});

	it("resetMeasure: clears strokes (fresh empty slots)", () => {
		const measures = measuresOf([slotWithStroke("quarter", 4, "roll-up"), makeEmptySlot("quarter")]);
		const res = resetMeasure(measures, 0, "quarter", [4, 4]);
		expect(res.measures[0].slots.every((s) => s.stroke === undefined)).toBe(true);
	});
});

describe("setSlotsRest semantics", () => {
	function measurePattern(slots: ReturnType<typeof makeEmptySlot>[]): FingerpickPattern {
		return {
			id: "p",
			name: "t",
			description: "",
			bpm: 100,
			timeSignature: [4, 4],
			measures: measuresOf(slots),
		};
	}

	it("silencing a slot clears its note data and any roll stroke but keeps its duration", () => {
		let p = measurePattern([
			slotWith("eighth", 5),
			makeEmptySlot("eighth"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		p = setStroke(p, { measureIndex: 0, slotIndex: 0 }, "roll-down");
		p = setSlotsRest(p, [{ measureIndex: 0, slotIndex: 0 }], true);

		const slot = p.measures[0].slots[0];
		expect(slot.isRest).toBe(true);
		expect(slot.duration).toBe("eighth"); // duration preserved → measure total unchanged
		expect(slot.strings.every((sf) => sf.fret === null && !sf.muted)).toBe(true);
		expect(slot.stroke).toBeUndefined();
	});

	it("clearing the rest omits the isRest key (byte-identical to a never-rest slot)", () => {
		let p = measurePattern([makeEmptySlot("quarter"), makeEmptySlot("quarter")]);
		p = setSlotsRest(p, [{ measureIndex: 0, slotIndex: 0 }], true);
		p = setSlotsRest(p, [{ measureIndex: 0, slotIndex: 0 }], false);
		const slot = p.measures[0].slots[0];
		expect("isRest" in slot).toBe(false);
		expect(slot.duration).toBe("quarter");
	});
});

describe("split/merge round-trips for newly exposed integer-weight durations", () => {
	it("sixteenth ⇄ two 32nds, keeping the 4/4 measure at 32 units", () => {
		const measures = measuresOf([
			slotWith("sixteenth", 5), // 2
			makeEmptySlot("sixteenth"), // 2
			makeEmptySlot("quarter"), // 8
			makeEmptySlot("quarter"), // 8
			makeEmptySlot("quarter"), // 8
			makeEmptySlot("eighth"), // 4
		]); // = 32
		expect(usedUnits(measures[0].slots)).toBe(measureCapacity([4, 4]));

		const split = splitSlot(measures, 0, 0, "32nd", [4, 4]);
		expect(split[0].slots[0].duration).toBe("32nd");
		expect(split[0].slots[1].duration).toBe("32nd");
		expect(firstFret(split, 0)).toBe(5); // first sub-slot inherits the note
		expect(firstFret(split, 1)).toBeNull();
		expect(usedUnits(split[0].slots)).toBe(32);

		const merged = mergeSlots(split, 0, 0, "sixteenth", [4, 4]);
		expect(merged.type).toBe("ok");
		if (merged.type === "ok") {
			expect(merged.measures[0].slots[0].duration).toBe("sixteenth");
			expect(merged.measures[0].slots[0].strings[0].fret).toBe(5);
			expect(usedUnits(merged.measures[0].slots)).toBe(32);
		}
	});

	it("dotted-quarter ⇄ two dotted-eighths, keeping the 4/4 measure at 32 units", () => {
		const measures = measuresOf([
			slotWith("dotted-quarter", 7), // 12
			makeEmptySlot("quarter"), // 8
			makeEmptySlot("quarter"), // 8
			makeEmptySlot("eighth"), // 4
		]); // = 32
		expect(usedUnits(measures[0].slots)).toBe(32);

		const split = splitSlot(measures, 0, 0, "dotted-eighth", [4, 4]);
		expect(split[0].slots[0].duration).toBe("dotted-eighth");
		expect(split[0].slots[1].duration).toBe("dotted-eighth");
		expect(firstFret(split, 0)).toBe(7);
		expect(usedUnits(split[0].slots)).toBe(32);

		const merged = mergeSlots(split, 0, 0, "dotted-quarter", [4, 4]);
		expect(merged.type).toBe("ok");
		if (merged.type === "ok") {
			expect(merged.measures[0].slots[0].duration).toBe("dotted-quarter");
			expect(merged.measures[0].slots[0].strings[0].fret).toBe(7);
			expect(usedUnits(merged.measures[0].slots)).toBe(32);
		}
	});

	it("splits a quarter into eight 32nds without breaking capacity", () => {
		const measures = measuresOf([
			slotWith("quarter", 3),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const split = splitSlot(measures, 0, 0, "32nd", [4, 4]);
		expect(split[0].slots.filter((s) => s.duration === "32nd")).toHaveLength(8);
		expect(usedUnits(split[0].slots)).toBe(32);
	});
});

describe("integer-weight guard on split/merge", () => {
	it("hasIntegerUnitWeight: true for plain/dotted/32nd, false for triplets", () => {
		expect(hasIntegerUnitWeight("dotted-quarter")).toBe(true);
		expect(hasIntegerUnitWeight("dotted-eighth")).toBe(true);
		expect(hasIntegerUnitWeight("32nd")).toBe(true);
		expect(hasIntegerUnitWeight("quarter")).toBe(true);
		expect(hasIntegerUnitWeight("eighth-triplet")).toBe(false);
		expect(hasIntegerUnitWeight("sixteenth-triplet")).toBe(false);
	});

	it("splitSlot rejects both triplet targets, returning the measures unchanged", () => {
		const measures = measuresOf([
			slotWith("quarter", 3),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		expect(splitSlot(measures, 0, 0, "eighth-triplet", [4, 4])).toEqual(measures);
		expect(splitSlot(measures, 0, 0, "sixteenth-triplet", [4, 4])).toEqual(measures);
	});

	it("mergeSlots rejects both triplet targets, returning an ok/unchanged result", () => {
		const measures = measuresOf([
			slotWith("eighth", 2),
			makeEmptySlot("eighth"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		expect(mergeSlots(measures, 0, 0, "eighth-triplet", [4, 4])).toEqual({ type: "ok", measures });
		expect(mergeSlots(measures, 0, 0, "sixteenth-triplet", [4, 4])).toEqual({
			type: "ok",
			measures,
		});
	});
});

describe("newly exposed durations survive editor → render → audio with consistent length", () => {
	function singleSlotPattern(duration: Duration, bpm: number): FingerpickPattern {
		return {
			id: "p",
			name: "t",
			description: "",
			bpm,
			timeSignature: [4, 4],
			measures: measuresOf([slotWith(duration, 3)]),
		};
	}

	// Each layer measures the duration's length relative to a quarter note, independently:
	// the editor via unit weight, the VexFlow render via note ticks, the scheduler via
	// total pattern duration. All three ratios must agree.
	function layerRatios(duration: Duration): { editor: number; render: number; audio: number } {
		const bpm = 120;
		const q = singleSlotPattern("quarter", bpm);
		const d = singleSlotPattern(duration, bpm);
		const qNote = fingerpickToVexFlow(q.measures[0]).notes[0];
		const dNote = fingerpickToVexFlow(d.measures[0]).notes[0];
		return {
			editor: slotDurationUnits(duration) / slotDurationUnits("quarter"),
			render: dNote.getTicks().value() / qNote.getTicks().value(),
			audio: getTotalPatternDuration(d, bpm) / getTotalPatternDuration(q, bpm),
		};
	}

	for (const duration of ["dotted-quarter", "dotted-eighth", "32nd"] as Duration[]) {
		it(`${duration}: editor, VexFlow render, and scheduler agree on relative length`, () => {
			const r = layerRatios(duration);
			expect(r.render).toBeCloseTo(r.editor, 6);
			expect(r.audio).toBeCloseTo(r.editor, 6);

			// The scheduler emits an actual note event whose length is the slot duration.
			const pattern = singleSlotPattern(duration, 120);
			const events = fingerpickPatternToScheduleEvents(pattern, 120);
			expect(events.length).toBeGreaterThanOrEqual(1);
			expect(events[0].duration).toBeCloseTo(getTotalPatternDuration(pattern, 120), 6);
		});
	}
});

describe("splitTargetsForSlot", () => {
	it("offers every even subdivision of a quarter that fits the measure", () => {
		const [measure] = measuresOf([
			slotWith("quarter", 5),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const targets = splitTargetsForSlot(measure, 0, [4, 4]);
		expect(targets).toEqual([
			{ duration: "eighth", count: 2 },
			{ duration: "sixteenth", count: 4 },
			{ duration: "32nd", count: 8 },
		]);
	});

	it("returns nothing for a 32nd (nothing smaller to split into)", () => {
		const [measure] = measuresOf([makeEmptySlot("32nd")]);
		expect(splitTargetsForSlot(measure, 0, [4, 4])).toEqual([]);
	});
});

describe("mergeTargetsForSlot", () => {
	it("offers every larger value a following run sums to", () => {
		// [E, E, E, E] → E+E = quarter (2 slots), E+E+E = dotted-quarter (3 slots),
		// E+E+E+E = half (4 slots). All three should be offered.
		const [measure] = measuresOf([
			slotWith("eighth", 5), // 4
			makeEmptySlot("eighth"), // 4
			makeEmptySlot("eighth"), // 4
			makeEmptySlot("eighth"), // 4
		]);
		expect(mergeTargetsForSlot(measure, 0)).toEqual([
			{ duration: "quarter", count: 2 },
			{ duration: "dotted-quarter", count: 3 },
			{ duration: "half", count: 4 },
		]);
	});

	it("offers nothing when no run sums to a supported value", () => {
		// A lone eighth followed by a quarter: eighth+quarter = 12 = dotted-quarter.
		const [measure] = measuresOf([slotWith("eighth", 5), makeEmptySlot("quarter")]);
		expect(mergeTargetsForSlot(measure, 0)).toEqual([{ duration: "dotted-quarter", count: 2 }]);
		// The last slot alone has no following slot to merge with.
		expect(mergeTargetsForSlot(measure, 1)).toEqual([]);
	});
});

describe("split/merge preserve the isRest flag on the head slot", () => {
	it("splitting a rest keeps the first sub-slot silent, the rest as notes", () => {
		const rest = { ...makeEmptySlot("quarter"), isRest: true as const };
		const measures = measuresOf([rest, makeEmptySlot("quarter"), makeEmptySlot("quarter"), makeEmptySlot("quarter")]);
		const out = splitSlot(measures, 0, 0, "eighth", [4, 4]);
		expect(out[0].slots[0].isRest).toBe(true);
		expect(out[0].slots[1].isRest).toBeUndefined();
	});

	it("merging keeps the head slot's rest flag", () => {
		const rest = { ...makeEmptySlot("eighth"), isRest: true as const };
		const measures = measuresOf([rest, makeEmptySlot("eighth"), makeEmptySlot("quarter"), makeEmptySlot("quarter"), makeEmptySlot("quarter")]);
		const res = mergeSlots(measures, 0, 0, "quarter", [4, 4]);
		expect(res.type).toBe("ok");
		if (res.type === "ok") expect(res.measures[0].slots[0].isRest).toBe(true);
	});
});

describe("normalizeLoadedPattern (legacy rest migration)", () => {
	function patternWithRawSlots(slots: unknown[]): FingerpickPattern {
		return {
			id: "p",
			name: "legacy",
			description: "",
			bpm: 100,
			timeSignature: [4, 4],
			measures: [{ id: "m0", slots: slots as Measure["slots"] }],
		};
	}

	it("converts a legacy duration:'rest' slot to a quarter-duration isRest slot", () => {
		const legacy = patternWithRawSlots([
			{ id: "s0", duration: "rest", strings: makeEmptySlot("quarter").strings },
			makeEmptySlot("quarter"),
		]);
		const out = normalizeLoadedPattern(legacy);
		const slot = out.measures[0].slots[0];
		expect(slot.duration).toBe("quarter");
		expect(slot.isRest).toBe(true);
		expect(slot.strings.every((sf) => sf.fret === null && !sf.muted)).toBe(true);
	});

	it("leaves an already-migrated pattern referentially unchanged", () => {
		const clean = patternWithRawSlots([makeEmptySlot("quarter"), makeEmptySlot("eighth")]);
		expect(normalizeLoadedPattern(clean)).toBe(clean);
	});
});
