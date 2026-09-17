import { describe, it, expect } from "vitest";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import {
	makeDefaultPattern,
	makeEmptySlot,
	makeEmptyMeasure,
	beatTicks,
	beatDivision,
	defaultFillDuration,
	setFret,
	setInactive,
	toggleMuted,
	setTechnique,
	setTied,
	setStroke,
	moveCell,
	previousSlotFret,
	hasPreviousNoteOnString,
	availableTechniques,
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
	carryChordMarks,
	changeTimeSignature,
	isTripletDuration,
	tripletGroups,
	tripletGroupAt,
	expandTripletGroups,
	tripletPlainValue,
	tripletForPlainValue,
	tripletWrittenValue,
	DURATION_TICKS,
	TICKS_PER_WHOLE,
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

describe("availableTechniques", () => {
	const cell: Cell = { measureIndex: 0, slotIndex: 1, stringIndex: 5 };
	// Set prev-slot fret then current-slot fret on the same string.
	const withFrets = (prevFret: number, currFret: number): FingerpickPattern => {
		let p = twoMeasurePattern();
		p = setFret(p, { measureIndex: 0, slotIndex: 0, stringIndex: 5 }, prevFret);
		p = setFret(p, cell, currFret);
		return p;
	};

	it("allows only hammer-on and slide-up when ascending (1 → 5)", () => {
		expect(availableTechniques(withFrets(1, 5), cell)).toEqual({
			"hammer-on": true,
			"pull-off": false,
			"slide-up": true,
			"slide-down": false,
			tied: false,
		});
	});

	it("allows only pull-off and slide-down when descending (5 → 1)", () => {
		expect(availableTechniques(withFrets(5, 1), cell)).toEqual({
			"hammer-on": false,
			"pull-off": true,
			"slide-up": false,
			"slide-down": true,
			tied: false,
		});
	});

	it("allows only a tie when both notes share the same fret", () => {
		expect(availableTechniques(withFrets(3, 3), cell)).toEqual({
			"hammer-on": false,
			"pull-off": false,
			"slide-up": false,
			"slide-down": false,
			tied: true,
		});
	});

	it("disables everything with no previous sounding note", () => {
		let p = twoMeasurePattern();
		p = setFret(p, cell, 4);
		expect(availableTechniques(p, cell)).toEqual({
			"hammer-on": false,
			"pull-off": false,
			"slide-up": false,
			"slide-down": false,
			tied: false,
		});
	});

	it("disables everything when the current cell has no fret", () => {
		let p = twoMeasurePattern();
		p = setFret(p, { measureIndex: 0, slotIndex: 0, stringIndex: 5 }, 2);
		expect(availableTechniques(p, cell)).toEqual({
			"hammer-on": false,
			"pull-off": false,
			"slide-up": false,
			"slide-down": false,
			tied: false,
		});
	});

	it("disables everything when the previous note is muted", () => {
		let p = withFrets(1, 5);
		p = toggleMuted(p, { measureIndex: 0, slotIndex: 0, stringIndex: 5 });
		expect(availableTechniques(p, cell)).toEqual({
			"hammer-on": false,
			"pull-off": false,
			"slide-up": false,
			"slide-down": false,
			tied: false,
		});
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

	it("counts 6/8 in two dotted-quarter beats: 1 + a 2 + a", () => {
		const slots = slotsOf(Array<Duration>(6).fill("eighth"));
		expect(computeBeatLabels(slots, [6, 8])).toEqual(["1", "+", "a", "2", "+", "a"]);
		expect(computeBeatLabels(slotsOf(["dotted-quarter", "dotted-quarter"]), [6, 8])).toEqual(["1", "2"]);
		// ♩ ♪ | ♪ ♩ : the quarter sits on "1", the eighth on "a"; then "2" and "+".
		expect(computeBeatLabels(slotsOf(["quarter", "eighth", "eighth", "quarter"]), [6, 8])).toEqual([
			"1", "a", "2", "+",
		]);
		expect(computeBeatLabels(Array<Duration>(12).fill("eighth").map((d) => makeEmptySlot(d)), [12, 8])).toEqual([
			"1", "+", "a", "2", "+", "a", "3", "+", "a", "4", "+", "a",
		]);
	});

	it("labels only the onsets on the beat's eighth grid when a compound beat has no counting of its own", () => {
		// Three quarters carried into 6/8 (a hemiola): 1, a, +.
		expect(computeBeatLabels(slotsOf(["quarter", "quarter", "quarter"]), [6, 8])).toEqual(["1", "a", "+"]);
		// A triplet carried into 6/8 (a beat of 36 ticks holds 4½ of them): the
		// members off the eighth grid go unlabelled rather than mislabelled.
		const carried = slotsOf(["quarter", "eighth-triplet", "eighth-triplet", "eighth-triplet", "eighth", "eighth"]);
		expect(computeBeatLabels(carried, [6, 8])).toEqual(["1", "a", "", "", "+", "a"]);
		// A simple beat whose finest value does not divide it (dotted eighth +
		// sixteenth) reads off the sixteenth grid: 1 . . a.
		expect(computeBeatLabels(slotsOf(["dotted-eighth", "sixteenth"]), [4, 4])).toEqual(["1", "a"]);
		// A lone off-beat onset is counted, not given the beat number it missed.
		expect(computeBeatLabels(slotsOf(["dotted-quarter", "eighth", "half"]), [4, 4])).toEqual(["1", "+", "3"]);
		expect(computeBeatLabels(slotsOf(["eighth", "sixteenth-triplet", "sixteenth-triplet", "sixteenth-triplet"]), [4, 4])).toEqual([
			"1", "+", "trip", "let",
		]);
	});

	it("subdivides a compound beat's sixteenths with ta, and a duplet as 1 +", () => {
		const sixteenths = slotsOf(Array<Duration>(6).fill("sixteenth"));
		expect(computeBeatLabels(sixteenths, [6, 8])).toEqual(["1", "ta", "+", "ta", "a", "ta"]);
		expect(computeBeatLabels(slotsOf(["dotted-eighth", "dotted-eighth"]), [6, 8])).toEqual(["1", "+"]);
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

	it("groups 6/8 by dotted-quarter beat, never by eighth", () => {
		const slots = slotsOf(["eighth", "sixteenth", "sixteenth", "eighth", "eighth", "eighth", "eighth"]);
		expect(computeBeatGroups(slots, [6, 8])).toEqual([[0, 1, 2, 3], [4, 5, 6]]);
		expect(computeBeatGroups(slotsOf(["dotted-quarter", "dotted-quarter"]), [6, 8])).toEqual([[0], [1]]);
	});
});

describe("beatTicks / beatDivision / defaultFillDuration / makeEmptyMeasure", () => {
	it("read the beat from the meter, not the denominator", () => {
		expect(beatTicks([4, 4])).toBe(24);
		expect(beatTicks([3, 4])).toBe(24);
		expect(beatTicks([2, 4])).toBe(24);
		expect(beatTicks([6, 8])).toBe(36);
		expect(beatTicks([12, 8])).toBe(36);
		expect(beatDivision([4, 4])).toBe(2);
		expect(beatDivision([6, 8])).toBe(3);
		expect(defaultFillDuration([4, 4])).toBe("quarter");
		expect(defaultFillDuration([6, 8])).toBe("eighth");
	});

	it("makeEmptyMeasure fills the bar with the meter's default value", () => {
		expect(makeEmptyMeasure().slots.map((s) => s.duration)).toEqual(Array(4).fill("quarter"));
		expect(makeEmptyMeasure([3, 4]).slots).toHaveLength(3);
		expect(makeEmptyMeasure([6, 8]).slots.map((s) => s.duration)).toEqual(Array(6).fill("eighth"));
		expect(makeEmptyMeasure([12, 8]).slots).toHaveLength(12);
		const jig: FingerpickPattern = { ...makeDefaultPattern(), timeSignature: [6, 8] };
		expect(addMeasure(jig).measures[1].slots).toHaveLength(6);
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

	it("never bisects a compound beat: its eighths are the windows, halved only inside", () => {
		// Three eighths in 6/8 are the beat's own division — singletons, not a
		// pair plus one; two sixteenths fill an eighth window (singletons, the
		// window covers them); four 32nds still pair under their sixteenths.
		expect(computeSubBeatGroups(slotsOf(["eighth", "eighth", "eighth"]), [6, 8])).toEqual([
			[0],
			[1],
			[2],
		]);
		expect(computeSubBeatGroups(slotsOf(["sixteenth", "sixteenth"]), [6, 8])).toEqual([
			[0],
			[1],
		]);
		expect(computeSubBeatGroups(slotsOf(["32nd", "32nd", "32nd", "32nd"]), [6, 8])).toEqual([
			[0, 1],
			[2, 3],
		]);
		// A duplet (two dotted eighths) straddles the eighth windows: singletons.
		expect(computeSubBeatGroups(slotsOf(["dotted-eighth", "dotted-eighth"]), [6, 8])).toEqual([
			[0],
			[1],
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
	it("returns 96/72/72 ticks for 4/4, 3/4 and 6/8", () => {
		expect(measureCapacity([4, 4])).toBe(96);
		expect(measureCapacity([3, 4])).toBe(72);
		expect(measureCapacity([6, 8])).toBe(72);
	});
});

describe("duration unit helpers", () => {
	it("slotDurationUnits maps the common durations to ticks", () => {
		expect(slotDurationUnits("whole")).toBe(TICKS_PER_WHOLE);
		expect(slotDurationUnits("quarter")).toBe(24);
		expect(slotDurationUnits("eighth")).toBe(12);
		expect(slotDurationUnits("sixteenth")).toBe(6);
	});

	it("every duration is an exact integer number of ticks, triplets included", () => {
		for (const [duration, ticks] of Object.entries(DURATION_TICKS)) {
			expect(Number.isInteger(ticks), duration).toBe(true);
		}
		expect(slotDurationUnits("eighth-triplet")).toBe(8);
		expect(slotDurationUnits("sixteenth-triplet")).toBe(4);
		expect(isTripletDuration("eighth-triplet")).toBe(true);
		expect(isTripletDuration("sixteenth-triplet")).toBe(true);
		expect(isTripletDuration("eighth")).toBe(false);
	});

	it("usedUnits and remainingUnits sum against capacity", () => {
		const slots = [makeEmptySlot("quarter"), makeEmptySlot("eighth")];
		expect(usedUnits(slots)).toBe(36);
		expect(remainingUnits(slots, [4, 4])).toBe(60);
	});

	it("a bar of triplets is exactly full: 12 eighth-triplets in 4/4, 9 in 3/4", () => {
		const twelve = Array.from({ length: 12 }, () => makeEmptySlot("eighth-triplet"));
		expect(usedUnits(twelve)).toBe(measureCapacity([4, 4]));
		expect(remainingUnits(twelve, [4, 4])).toBe(0);
		const nine = Array.from({ length: 9 }, () => makeEmptySlot("eighth-triplet"));
		expect(remainingUnits(nine, [3, 4])).toBe(0);
		const sixteenths = Array.from({ length: 24 }, () => makeEmptySlot("sixteenth-triplet"));
		expect(remainingUnits(sixteenths, [4, 4])).toBe(0);
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
	it("sixteenth ⇄ two 32nds, keeping the 4/4 measure at 96 ticks", () => {
		const measures = measuresOf([
			slotWith("sixteenth", 5), // 6
			makeEmptySlot("sixteenth"), // 6
			makeEmptySlot("quarter"), // 24
			makeEmptySlot("quarter"), // 24
			makeEmptySlot("quarter"), // 24
			makeEmptySlot("eighth"), // 12
		]); // = 96
		expect(usedUnits(measures[0].slots)).toBe(measureCapacity([4, 4]));

		const split = splitSlot(measures, 0, 0, "32nd", [4, 4]);
		expect(split[0].slots[0].duration).toBe("32nd");
		expect(split[0].slots[1].duration).toBe("32nd");
		expect(firstFret(split, 0)).toBe(5); // first sub-slot inherits the note
		expect(firstFret(split, 1)).toBeNull();
		expect(usedUnits(split[0].slots)).toBe(96);

		const merged = mergeSlots(split, 0, 0, "sixteenth", [4, 4]);
		expect(merged.type).toBe("ok");
		if (merged.type === "ok") {
			expect(merged.measures[0].slots[0].duration).toBe("sixteenth");
			expect(merged.measures[0].slots[0].strings[0].fret).toBe(5);
			expect(usedUnits(merged.measures[0].slots)).toBe(96);
		}
	});

	it("dotted-quarter ⇄ two dotted-eighths, keeping the 4/4 measure at 96 ticks", () => {
		const measures = measuresOf([
			slotWith("dotted-quarter", 7), // 36
			makeEmptySlot("quarter"), // 24
			makeEmptySlot("quarter"), // 24
			makeEmptySlot("eighth"), // 12
		]); // = 96
		expect(usedUnits(measures[0].slots)).toBe(96);

		const split = splitSlot(measures, 0, 0, "dotted-eighth", [4, 4]);
		expect(split[0].slots[0].duration).toBe("dotted-eighth");
		expect(split[0].slots[1].duration).toBe("dotted-eighth");
		expect(firstFret(split, 0)).toBe(7);
		expect(usedUnits(split[0].slots)).toBe(96);

		const merged = mergeSlots(split, 0, 0, "dotted-quarter", [4, 4]);
		expect(merged.type).toBe("ok");
		if (merged.type === "ok") {
			expect(merged.measures[0].slots[0].duration).toBe("dotted-quarter");
			expect(merged.measures[0].slots[0].strings[0].fret).toBe(7);
			expect(usedUnits(merged.measures[0].slots)).toBe(96);
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
		expect(usedUnits(split[0].slots)).toBe(96);
	});
});

describe("triplet guard on split/merge", () => {
	it("splitSlot rejects a triplet target that is not three of the source", () => {
		const measures = measuresOf([
			slotWith("quarter", 3),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		expect(splitSlot(measures, 0, 0, "sixteenth-triplet", [4, 4])).toEqual(measures);
		const half = measuresOf([slotWith("half", 3), makeEmptySlot("half")]);
		expect(splitSlot(half, 0, 0, "eighth-triplet", [4, 4])).toEqual(half);
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

	it("a run through a triplet slot never merges, even when its ticks sum to a plain value", () => {
		// eighth-triplet (8) + sixteenth-triplet (4) = 12 = an eighth by tick count,
		// but the run is not a note.
		const measures = measuresOf([
			slotWith("eighth-triplet", 2),
			makeEmptySlot("sixteenth-triplet"),
			makeEmptySlot("quarter"),
		]);
		expect(mergeSlots(measures, 0, 0, "eighth", [4, 4])).toEqual({ type: "ok", measures });
		expect(mergeTargetsForSlot(measures[0], 0)).toEqual([]);
		// A plain run stops at a triplet: quarter + eighth-triplet is not a note.
		const mixed = measuresOf([
			slotWith("eighth", 2),
			makeEmptySlot("eighth-triplet"),
			makeEmptySlot("eighth-triplet"),
			makeEmptySlot("eighth-triplet"),
		]);
		expect(mergeSlots(mixed, 0, 0, "dotted-quarter", [4, 4])).toEqual({ type: "ok", measures: mixed });
		expect(mergeTargetsForSlot(mixed[0], 0)).toEqual([]);
	});
});

describe("triplet groups", () => {
	const t = (fret?: number) => (fret === undefined ? makeEmptySlot("eighth-triplet") : slotWith("eighth-triplet", fret));
	const st = () => makeEmptySlot("sixteenth-triplet");

	it("maps a triplet to the plain value it adds up to, and back", () => {
		expect(tripletPlainValue("eighth-triplet")).toBe("quarter");
		expect(tripletPlainValue("sixteenth-triplet")).toBe("eighth");
		expect(tripletForPlainValue("quarter")).toBe("eighth-triplet");
		expect(tripletForPlainValue("eighth")).toBe("sixteenth-triplet");
		expect(tripletForPlainValue("half")).toBeNull();
		expect(tripletForPlainValue("dotted-quarter")).toBeNull();
		expect(tripletWrittenValue("eighth-triplet")).toBe("eighth");
		expect(tripletWrittenValue("sixteenth-triplet")).toBe("sixteenth");
	});

	it("chunks a run of the same triplet value in threes from the run's start", () => {
		expect(tripletGroups([t(), t(), t(), t(), t(), t()])).toEqual([
			{ start: 0, duration: "eighth-triplet" },
			{ start: 3, duration: "eighth-triplet" },
		]);
		// A run of a different triplet value is its own run.
		expect(tripletGroups([makeEmptySlot("quarter"), t(), t(), t(), st(), st(), st()])).toEqual([
			{ start: 1, duration: "eighth-triplet" },
			{ start: 4, duration: "sixteenth-triplet" },
		]);
	});

	it("leaves a leftover one or two at the end of a run in no group", () => {
		expect(tripletGroups([t(), t(), t(), t()])).toEqual([{ start: 0, duration: "eighth-triplet" }]);
		expect(tripletGroups([t(), t()])).toEqual([]);
		expect(tripletGroupAt([t(), t(), t(), t()], 3)).toBeNull();
		expect(tripletGroupAt([t(), t(), t(), t()], 1)).toEqual({ start: 0, duration: "eighth-triplet" });
		expect(tripletGroupAt([makeEmptySlot("quarter")], 0)).toBeNull();
	});

	it("expandTripletGroups grows a selection to every member of a touched group", () => {
		const slots = [makeEmptySlot("quarter"), t(), t(), t(), makeEmptySlot("quarter")];
		expect([...expandTripletGroups(slots, new Set([2]))].sort()).toEqual([1, 2, 3]);
		expect([...expandTripletGroups(slots, new Set([0, 4]))].sort()).toEqual([0, 4]);
		expect([...expandTripletGroups(slots, new Set([0, 3]))].sort()).toEqual([0, 1, 2, 3]);
	});

	// A 4/4 bar: quarter, a triplet (1 2 3 on the top string), quarter, quarter.
	function tripletPattern(): FingerpickPattern {
		return {
			id: "p",
			name: "p",
			bpm: 100,
			timeSignature: [4, 4],
			measures: measuresOf([slotWith("quarter", 9), t(1), t(2), t(3), makeEmptySlot("quarter"), makeEmptySlot("quarter")]),
		};
	}
	const durationsOf = (p: FingerpickPattern) => p.measures[0].slots.map((s) => s.duration);
	const topFrets = (p: FingerpickPattern) => p.measures[0].slots.map((s) => s.strings[0].fret);

	it("deleteSlots on any member removes the whole group, carrying its chord mark on", () => {
		const chord = { root: "C", suffix: "major" };
		const p = tripletPattern();
		p.measures[0].slots[1] = { ...p.measures[0].slots[1], chord };
		const out = deleteSlots(p, [{ measureIndex: 0, slotIndex: 2 }]);
		expect(durationsOf(out)).toEqual(["quarter", "quarter", "quarter"]);
		expect(topFrets(out)).toEqual([9, null, null]);
		expect(out.measures[0].slots[1].chord).toEqual(chord);
	});

	it("duplicateSlots on a member copies the group after the group, not after the member", () => {
		const out = duplicateSlots(tripletPattern(), [{ measureIndex: 0, slotIndex: 2 }]);
		expect(durationsOf(out)).toEqual([
			"quarter",
			"eighth-triplet", "eighth-triplet", "eighth-triplet",
			"eighth-triplet", "eighth-triplet", "eighth-triplet",
			"quarter", "quarter",
		]);
		expect(topFrets(out)).toEqual([9, 1, 2, 3, 1, 2, 3, null, null]);
		// Selecting two members of one group still yields one copy.
		const two = duplicateSlots(tripletPattern(), [
			{ measureIndex: 0, slotIndex: 1 },
			{ measureIndex: 0, slotIndex: 3 },
		]);
		expect(two.measures[0].slots).toHaveLength(9);
		// The copy is its own group with fresh ids.
		expect(tripletGroups(out.measures[0].slots)).toEqual([
			{ start: 1, duration: "eighth-triplet" },
			{ start: 4, duration: "eighth-triplet" },
		]);
		expect(new Set(out.measures[0].slots.map((s) => s.id)).size).toBe(9);
	});

	it("insertSlots never lands inside a group: before → before its first, after → after its last", () => {
		const before = insertSlots(tripletPattern(), [{ measureIndex: 0, slotIndex: 2 }], "before");
		expect(durationsOf(before)).toEqual([
			"quarter", "quarter", "eighth-triplet", "eighth-triplet", "eighth-triplet", "quarter", "quarter",
		]);
		const after = insertSlots(tripletPattern(), [{ measureIndex: 0, slotIndex: 2 }], "after");
		expect(durationsOf(after)).toEqual([
			"quarter", "eighth-triplet", "eighth-triplet", "eighth-triplet", "quarter", "quarter", "quarter",
		]);
		expect(topFrets(after)).toEqual([9, 1, 2, 3, null, null, null]);
		// Two members targeted → one insert.
		const twice = insertSlots(
			tripletPattern(),
			[{ measureIndex: 0, slotIndex: 1 }, { measureIndex: 0, slotIndex: 3 }],
			"after",
		);
		expect(twice.measures[0].slots).toHaveLength(7);
	});

	it("splitSlot 3×: a quarter into eighth-triplets, an eighth into sixteenth-triplets, head keeps data", () => {
		const chord = { root: "A", suffix: "minor" };
		const measures = measuresOf([
			{ ...slotWith("quarter", 5), chord, stroke: "roll-down" as const },
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const out = splitSlot(measures, 0, 0, "eighth-triplet", [4, 4]);
		expect(out[0].slots.slice(0, 3).map((s) => s.duration)).toEqual([
			"eighth-triplet", "eighth-triplet", "eighth-triplet",
		]);
		expect(out[0].slots).toHaveLength(6);
		expect(usedUnits(out[0].slots)).toBe(96);
		expect(firstFret(out, 0)).toBe(5);
		expect(firstFret(out, 1)).toBeNull();
		expect(out[0].slots[0].chord).toEqual(chord);
		expect(out[0].slots[0].stroke).toBe("roll-down");
		expect(tripletGroups(out[0].slots)).toEqual([{ start: 0, duration: "eighth-triplet" }]);

		const eighths = measuresOf([slotWith("eighth", 2), makeEmptySlot("eighth")]);
		const s16 = splitSlot(eighths, 0, 0, "sixteenth-triplet", [4, 4]);
		expect(s16[0].slots.map((s) => s.duration)).toEqual([
			"sixteenth-triplet", "sixteenth-triplet", "sixteenth-triplet", "eighth",
		]);
	});

	it("splitSlot refuses a triplet target that is not three of the source, and any split of a triplet slot", () => {
		const half = measuresOf([slotWith("half", 5), makeEmptySlot("half")]);
		expect(splitSlot(half, 0, 0, "eighth-triplet", [4, 4])).toEqual(half);
		const quarter = measuresOf([slotWith("quarter", 5), makeEmptySlot("quarter")]);
		expect(splitSlot(quarter, 0, 0, "sixteenth-triplet", [4, 4])).toEqual(quarter);
		const p = tripletPattern().measures;
		expect(splitSlot(p, 0, 1, "sixteenth", [4, 4])).toEqual(p);
		expect(splitSlot(p, 0, 1, "32nd", [4, 4])).toEqual(p);
	});

	it("splitTargetsForSlot offers the triplet in a simple meter, ordered by count, never in 6/8", () => {
		const [measure] = measuresOf([
			slotWith("quarter", 5),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		expect(splitTargetsForSlot(measure, 0, [4, 4])).toEqual([
			{ duration: "eighth", count: 2 },
			{ duration: "eighth-triplet", count: 3 },
			{ duration: "sixteenth", count: 4 },
			{ duration: "32nd", count: 8 },
		]);
		const [waltz] = measuresOf([slotWith("quarter", 5), makeEmptySlot("half")]);
		expect(splitTargetsForSlot(waltz, 0, [3, 4]).map((t) => t.duration)).toContain("eighth-triplet");
		const [jig] = measuresOf([slotWith("quarter", 5), makeEmptySlot("quarter"), makeEmptySlot("quarter")]);
		expect(splitTargetsForSlot(jig, 0, [6, 8]).map((t) => t.duration)).not.toContain("eighth-triplet");
		const [eighth] = measuresOf([slotWith("eighth", 5)]);
		expect(splitTargetsForSlot(eighth, 0, [4, 4])).toEqual([
			{ duration: "sixteenth", count: 2 },
			{ duration: "sixteenth-triplet", count: 3 },
			{ duration: "32nd", count: 4 },
		]);
		// A triplet member offers nothing.
		expect(splitTargetsForSlot(tripletPattern().measures[0], 2, [4, 4])).toEqual([]);
	});

	it("mergeSlots folds a group back to its plain value from its first member only", () => {
		const p = tripletPattern().measures;
		const fromMid = mergeSlots(p, 0, 2, "quarter", [4, 4]);
		expect(fromMid).toEqual({ type: "ok", measures: p });
		const wrongTarget = mergeSlots(p, 0, 1, "eighth", [4, 4]);
		expect(wrongTarget).toEqual({ type: "ok", measures: p });

		const res = mergeSlots(p, 0, 1, "quarter", [4, 4]);
		// Members 2 and 3 carry data, so the merge asks first.
		expect(res.type).toBe("confirm");
		if (res.type === "confirm") {
			expect(res.affectedSlotCount).toBe(2);
			const slots = res.pendingMeasures[0].slots;
			expect(slots.map((s) => s.duration)).toEqual(["quarter", "quarter", "quarter", "quarter"]);
			expect(slots[1].strings[0].fret).toBe(1);
			expect(usedUnits(slots)).toBe(96);
		}
	});

	it("mergeTargetsForSlot: the plain value on a group's first member, nothing on the others", () => {
		const [measure] = tripletPattern().measures;
		expect(mergeTargetsForSlot(measure, 1)).toEqual([{ duration: "quarter", count: 3 }]);
		expect(mergeTargetsForSlot(measure, 2)).toEqual([]);
		expect(mergeTargetsForSlot(measure, 3)).toEqual([]);
		// The plain quarter before the group cannot merge through it.
		expect(mergeTargetsForSlot(measure, 0)).toEqual([]);
	});

	it("split → merge round-trips to the original measure", () => {
		const measures = measuresOf([
			slotWith("quarter", 5),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const split = splitSlot(measures, 0, 0, "eighth-triplet", [4, 4]);
		const merged = mergeSlots(split, 0, 0, "quarter", [4, 4]);
		expect(merged.type).toBe("ok");
		if (merged.type === "ok") {
			const strip = (m: Measure[]) => m[0].slots.map(({ id: _id, ...rest }) => { void _id; return rest; });
			expect(strip(merged.measures)).toEqual(strip(measures));
		}
	});
});

describe("changeTimeSignature", () => {
	const C = { root: "C", suffix: "major" };
	const durations = (p: FingerpickPattern, m = 0) => p.measures[m].slots.map((s) => s.duration);
	const top = (p: FingerpickPattern, m = 0) => p.measures[m].slots.map((s) => s.strings[0].fret);
	function patternOf(ts: [number, number], ...measures: Measure[]): FingerpickPattern {
		return { id: "p", name: "p", bpm: 100, timeSignature: ts, measures };
	}

	it("grows a bar with room by padding empty plain values, carrying chord marks", () => {
		const p = patternOf([2, 4], { id: "m", slots: [{ ...slotWith("quarter", 1), chord: C }, slotWith("quarter", 2)] });
		const res = changeTimeSignature(p, [3, 4]);
		expect(res.affectedMeasures).toEqual([]);
		expect(res.fitted.timeSignature).toEqual([3, 4]);
		expect(durations(res.fitted)).toEqual(["quarter", "quarter", "quarter"]);
		expect(top(res.fitted)).toEqual([1, 2, null]);
		expect(res.fitted.measures[0].slots[0].chord).toEqual(C);
		expect(usedUnits(res.fitted.measures[0].slots)).toBe(measureCapacity([3, 4]));
		// 2/4 → 6/8 pads with eighths, not a hemiola quarter.
		expect(durations(changeTimeSignature(p, [6, 8]).fitted)).toEqual(["quarter", "quarter", "eighth", "eighth"]);
		// 6/8 → 12/8 pads with a dotted beat.
		const jig = patternOf([6, 8], { id: "m", slots: Array.from({ length: 6 }, () => makeEmptySlot("eighth")) });
		expect(durations(changeTimeSignature(jig, [12, 8]).fitted).slice(6)).toEqual(["dotted-quarter", "dotted-quarter"]);
	});

	it("cuts an overlong bar: a slot straddling the new end is dropped and the gap padded", () => {
		// 4/4 [half(1), half(2)] → 3/4: the second half straddles tick 72.
		const p = patternOf([4, 4], { id: "m", slots: [slotWith("half", 1), slotWith("half", 2)] });
		const res = changeTimeSignature(p, [3, 4]);
		expect(res.affectedMeasures).toEqual([0]);
		expect(durations(res.fitted)).toEqual(["half", "quarter"]);
		expect(top(res.fitted)).toEqual([1, null]);
		expect(usedUnits(res.fitted.measures[0].slots)).toBe(72);
		// Clear resets only the bar that lost something, to the meter's fill, keeping its id and flags.
		const two = patternOf(
			[4, 4],
			{ id: "a", repeatStart: true, slots: [slotWith("half", 1), slotWith("half", 2)] },
			{ id: "b", slots: [slotWith("quarter", 5), makeEmptySlot("quarter"), makeEmptySlot("quarter"), makeEmptySlot("quarter")] },
		);
		const res2 = changeTimeSignature(two, [3, 4]);
		expect(res2.affectedMeasures).toEqual([0]);
		expect(durations(res2.cleared, 0)).toEqual(["quarter", "quarter", "quarter"]);
		expect(top(res2.cleared, 0)).toEqual([null, null, null]);
		expect(res2.cleared.measures[0].id).toBe("a");
		expect(res2.cleared.measures[0].repeatStart).toBe(true);
		expect(top(res2.cleared, 1)).toEqual([5, null, null]);
	});

	it("dropping only empty slots needs no confirmation", () => {
		const p = patternOf([4, 4], { id: "m", slots: [slotWith("quarter", 1), makeEmptySlot("quarter"), makeEmptySlot("quarter"), makeEmptySlot("quarter")] });
		const res = changeTimeSignature(p, [2, 4]);
		expect(res.affectedMeasures).toEqual([]);
		expect(durations(res.fitted)).toEqual(["quarter", "quarter"]);
	});

	it("keeps 3/4 ↔ 6/8 slots as they are (same capacity)", () => {
		const p = patternOf([3, 4], { id: "m", slots: [slotWith("quarter", 1), slotWith("quarter", 2), slotWith("quarter", 3)] });
		const res = changeTimeSignature(p, [6, 8]);
		expect(res.affectedMeasures).toEqual([]);
		expect(res.fitted.measures[0].slots).toEqual(p.measures[0].slots);
		expect(res.split).toBeNull();
	});

	it("offers a split into equal bars when the old bar is a whole number of new ones", () => {
		const p = patternOf([4, 4], {
			id: "m",
			repeatStart: true,
			repeatEnd: true,
			repeatTimes: 3,
			slots: [slotWith("quarter", 1), { ...slotWith("quarter", 2), chord: C }, slotWith("eighth", 3), slotWith("eighth", 4), slotWith("quarter", 5)],
		});
		const res = changeTimeSignature(p, [2, 4]);
		expect(res.affectedMeasures).toEqual([0]);
		expect(res.split).not.toBeNull();
		const split = res.split!;
		expect(split.measures).toHaveLength(2);
		expect(durations(split, 0)).toEqual(["quarter", "quarter"]);
		expect(durations(split, 1)).toEqual(["eighth", "eighth", "quarter"]);
		expect(top(split, 1)).toEqual([3, 4, 5]);
		expect(split.measures[0].id).toBe("m");
		expect(split.measures[0].repeatStart).toBe(true);
		expect(split.measures[0].repeatEnd).toBeUndefined();
		expect(split.measures[1].repeatStart).toBeUndefined();
		expect(split.measures[1].repeatEnd).toBe(true);
		expect(split.measures[1].repeatTimes).toBe(3);
		expect(split.measures[0].slots[1].chord).toEqual(C);
		// 12/8 → 6/8 is a halving too; 4/4 → 3/4 is not.
		expect(changeTimeSignature(patternOf([12, 8], makeEmptyMeasure([12, 8])), [6, 8]).split?.measures).toHaveLength(2);
		expect(changeTimeSignature(p, [3, 4]).split).toBeNull();
	});

	it("does not offer a split when a note crosses the cut", () => {
		const p = patternOf([4, 4], { id: "m", slots: [slotWith("quarter", 1), slotWith("half", 2), slotWith("quarter", 3)] });
		expect(changeTimeSignature(p, [2, 4]).split).toBeNull();
	});
});

describe("triplet slots under reset / remap / chord carry", () => {
	const chord = { root: "C", suffix: "major" };

	it("carryChordMarks keeps a mark on a triplet onset when the bar is re-tiled", () => {
		// Marks on the 1st and 7th eighth-triplet (ticks 0 and 48) land on the first
		// and third quarter of the new bar — exact, not a floating-point near miss.
		const old = Array.from({ length: 12 }, (_, i) => ({
			...makeEmptySlot("eighth-triplet"),
			...(i === 0 || i === 6 ? { chord } : {}),
		}));
		const fresh = Array.from({ length: 4 }, () => makeEmptySlot("quarter"));
		const out = carryChordMarks(old, fresh);
		expect(out.map((s) => s.chord !== undefined)).toEqual([true, false, true, false]);
	});

	it("resetMeasure to eighth-triplets fills 4/4 with 12 and 3/4 with 9, carrying marks", () => {
		const measures = measuresOf([
			{ ...slotWith("quarter", 3), chord },
			makeEmptySlot("quarter"),
			{ ...makeEmptySlot("quarter"), chord },
			makeEmptySlot("quarter"),
		]);
		const res = resetMeasure(measures, 0, "eighth-triplet", [4, 4]);
		expect(res.type).toBe("confirm");
		expect(res.measures[0].slots).toHaveLength(12);
		expect(usedUnits(res.measures[0].slots)).toBe(96);
		expect(res.measures[0].slots.map((s) => s.chord !== undefined).filter(Boolean)).toHaveLength(2);
		expect(res.measures[0].slots[0].chord).toEqual(chord);
		expect(res.measures[0].slots[6].chord).toEqual(chord);

		const waltz = resetMeasure(measuresOf([makeEmptySlot("quarter")]), 0, "eighth-triplet", [3, 4]);
		expect(waltz.measures[0].slots).toHaveLength(9);
	});

	it("remapMeasure keeps a note at a triplet onset that lands on a new slot", () => {
		// 12 eighth-triplets with data on the 4th (tick 24 = beat 2) → quarters: the
		// second quarter keeps it; data on the 2nd (tick 8, inside beat 1, whose slot
		// the first triplet already claimed) is discarded.
		const slots = Array.from({ length: 12 }, (_, i) =>
			i === 3 ? slotWith("eighth-triplet", 7) : i === 1 ? slotWith("eighth-triplet", 9) : makeEmptySlot("eighth-triplet"),
		);
		const out = remapMeasure(measuresOf(slots), 0, "quarter", [4, 4]);
		expect(out[0].slots).toHaveLength(4);
		expect(firstFret(out, 0)).toBeNull();
		expect(firstFret(out, 1)).toBe(7);
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
	it("offers every even subdivision of a quarter that fits the measure, and its triplet", () => {
		const [measure] = measuresOf([
			slotWith("quarter", 5),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const targets = splitTargetsForSlot(measure, 0, [4, 4]);
		expect(targets).toEqual([
			{ duration: "eighth", count: 2 },
			{ duration: "eighth-triplet", count: 3 },
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

describe("chord marks survive structural edits", () => {
	const C = { root: "C", suffix: "major" };
	const Am = { root: "A", suffix: "minor" };
	const withChord = (slot: ReturnType<typeof makeEmptySlot>, chord: typeof C) => ({
		...slot,
		chord,
	});

	it("splitSlot: the head sub-slot keeps the mark", () => {
		const measures = measuresOf([
			withChord(makeEmptySlot("quarter"), C),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const out = splitSlot(measures, 0, 0, "eighth", [4, 4]);
		expect(out[0].slots[0].chord).toEqual(C);
		expect(out[0].slots[1].chord).toBeUndefined();
	});

	it("mergeSlots: the earliest mark in the merged run starts the merged note", () => {
		const measures = measuresOf([
			makeEmptySlot("eighth"),
			withChord(makeEmptySlot("eighth"), Am),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const res = mergeSlots(measures, 0, 0, "quarter", [4, 4]);
		expect(res.type).toBe("ok");
		if (res.type === "ok") expect(res.measures[0].slots[0].chord).toEqual(Am);
	});

	it("mergeSlots: the first slot's own mark wins over a later one in the run", () => {
		const measures = measuresOf([
			withChord(makeEmptySlot("eighth"), C),
			withChord(makeEmptySlot("eighth"), Am),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		]);
		const res = mergeSlots(measures, 0, 0, "quarter", [4, 4]);
		if (res.type === "ok") expect(res.measures[0].slots[0].chord).toEqual(C);
	});

	it("deleteSlots: a deleted slot's mark moves to the next surviving slot", () => {
		const p: FingerpickPattern = {
			...twoMeasurePattern(),
			measures: measuresOf([
				withChord(makeEmptySlot(), C),
				makeEmptySlot(),
				makeEmptySlot(),
				makeEmptySlot(),
			]),
		};
		const out = deleteSlots(p, [{ measureIndex: 0, slotIndex: 0 }]);
		expect(out.measures[0].slots).toHaveLength(3);
		expect(out.measures[0].slots[0].chord).toEqual(C);
	});

	it("deleteSlots: of several deleted in a row, the last mark is the one carried", () => {
		const p: FingerpickPattern = {
			...twoMeasurePattern(),
			measures: measuresOf([
				withChord(makeEmptySlot(), C),
				withChord(makeEmptySlot(), Am),
				makeEmptySlot(),
				makeEmptySlot(),
			]),
		};
		const out = deleteSlots(p, [
			{ measureIndex: 0, slotIndex: 0 },
			{ measureIndex: 0, slotIndex: 1 },
		]);
		expect(out.measures[0].slots.map((s) => s.chord)).toEqual([Am, undefined]);
	});

	it("deleteSlots: a surviving slot with its own mark keeps it", () => {
		const p: FingerpickPattern = {
			...twoMeasurePattern(),
			measures: measuresOf([
				withChord(makeEmptySlot(), C),
				withChord(makeEmptySlot(), Am),
				makeEmptySlot(),
				makeEmptySlot(),
			]),
		};
		const out = deleteSlots(p, [{ measureIndex: 0, slotIndex: 0 }]);
		expect(out.measures[0].slots[0].chord).toEqual(Am);
	});

	it("deleteSlots: deleting the last slot drops its mark rather than moving it backwards", () => {
		const p: FingerpickPattern = {
			...twoMeasurePattern(),
			measures: measuresOf([makeEmptySlot(), withChord(makeEmptySlot(), C)]),
		};
		const out = deleteSlots(p, [{ measureIndex: 0, slotIndex: 1 }]);
		expect(out.measures[0].slots).toHaveLength(1);
		expect(out.measures[0].slots[0].chord).toBeUndefined();
	});

	it("deleteSlots: emptying a measure leaves the mark on the fresh slot", () => {
		const p: FingerpickPattern = {
			...twoMeasurePattern(),
			measures: measuresOf([withChord(makeEmptySlot(), C)]),
		};
		const out = deleteSlots(p, [{ measureIndex: 0, slotIndex: 0 }]);
		expect(out.measures[0].slots).toHaveLength(1);
		expect(out.measures[0].slots[0].chord).toEqual(C);
	});

	it("duplicateSlots: the copy does not repeat the mark", () => {
		const p: FingerpickPattern = {
			...twoMeasurePattern(),
			measures: measuresOf([withChord(makeEmptySlot(), C), makeEmptySlot()]),
		};
		const out = duplicateSlots(p, [{ measureIndex: 0, slotIndex: 0 }]);
		expect(out.measures[0].slots[0].chord).toEqual(C);
		expect(out.measures[0].slots[1].chord).toBeUndefined();
	});

	it("resetMeasure: marks land on the new slot covering their onset", () => {
		// C on beat 1, Am on beat 3 (eighths: slot index 4).
		const measures = measuresOf([
			withChord(makeEmptySlot("eighth"), C),
			...Array.from({ length: 3 }, () => makeEmptySlot("eighth")),
			withChord(makeEmptySlot("eighth"), Am),
			...Array.from({ length: 3 }, () => makeEmptySlot("eighth")),
		]);
		const res = resetMeasure(measures, 0, "quarter", [4, 4]);
		expect(res.measures[0].slots.map((s) => s.chord)).toEqual([C, undefined, Am, undefined]);
	});

	it("resetMeasure: two marks collapsing into one slot keep the earlier", () => {
		const measures = measuresOf([
			withChord(makeEmptySlot("eighth"), C),
			withChord(makeEmptySlot("eighth"), Am),
			...Array.from({ length: 6 }, () => makeEmptySlot("eighth")),
		]);
		const res = resetMeasure(measures, 0, "half", [4, 4]);
		expect(res.measures[0].slots.map((s) => s.chord)).toEqual([C, undefined]);
	});

	it("remapMeasure: a mark on an empty slot is still carried", () => {
		const measures = measuresOf([
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			withChord(makeEmptySlot("quarter"), Am),
			makeEmptySlot("quarter"),
		]);
		const out = remapMeasure(measures, 0, "eighth", [4, 4]);
		expect(out[0].slots[4].chord).toEqual(Am);
		expect(out[0].slots.filter((s) => s.chord)).toHaveLength(1);
	});
});

describe("normalizeLoadedPattern (capo)", () => {
	it("keeps a real capo and drops a junk one", () => {
		const base = twoMeasurePattern();
		expect(normalizeLoadedPattern({ ...base, capo: 5 }).capo).toBe(5);
		expect("capo" in normalizeLoadedPattern({ ...base, capo: Number.NaN })).toBe(false);
		expect(normalizeLoadedPattern({ ...base, capo: 30 }).capo).toBe(12);
	});

	it("returns the same object when there is nothing to fix", () => {
		const base = twoMeasurePattern();
		expect(normalizeLoadedPattern(base)).toBe(base);
	});
});
