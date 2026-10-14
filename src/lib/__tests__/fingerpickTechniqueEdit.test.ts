import { describe, it, expect } from "vitest";

import type { BeatSlot, FingerpickPattern, StringFret } from "@/lib/fingerpickTypes";
import {
	clearNoteMarks,
	nextBend,
	nextVibrato,
	noteContext,
	setEffect,
	setLink,
	setPercussion,
	setSpanOver,
	spanCoversSlot,
	spanTargets,
	techniqueBlock,
	toggleLink,
	toggleSpanOver,
} from "@/lib/fingerpickTechniqueEdit";
import {
	cloneMeasureInPattern,
	deleteSlots,
	duplicateSlots,
	insertSlots,
	mergeSlots,
	setFret,
	setNoteTechnique,
	setStroke,
	setTechnique,
	setTied,
	shiftMeasureStrings,
	splitSlot,
	withMeasures,
	type Cell,
} from "@/lib/fingerpickEdit";
import { stripV2 } from "@/lib/fingerpickCompat";

const silent = (): StringFret => ({ fret: null, technique: null, tied: false, muted: false });
const note = (fret: number, extra: Partial<StringFret> = {}): StringFret => ({
	fret,
	technique: null,
	tied: false,
	muted: false,
	...extra,
});
const slot = (id: string, notes: Record<number, StringFret> = {}, extra: Partial<BeatSlot> = {}): BeatSlot => {
	const strings = [silent(), silent(), silent(), silent(), silent(), silent()] as BeatSlot["strings"];
	for (const [i, sf] of Object.entries(notes)) strings[Number(i)] = sf;
	return { id, duration: "quarter", strings, ...extra };
};
const pattern = (measures: BeatSlot[][], extra: Partial<FingerpickPattern> = {}): FingerpickPattern => ({
	id: "p",
	name: "t",
	bpm: 80,
	timeSignature: [4, 4],
	schemaVersion: 2,
	measures: measures.map((slots, i) => ({ id: `m${i}`, slots })),
	...extra,
});
const at = (p: FingerpickPattern, c: Cell) => p.measures[c.measureIndex].slots[c.slotIndex].strings[c.stringIndex];
const c = (slotIndex: number, stringIndex = 2, measureIndex = 0): Cell => ({ measureIndex, slotIndex, stringIndex });

// Four quarters on string 2: 5, 7, 7, 5.
const base = () =>
	pattern([[slot("a", { 2: note(5) }), slot("b", { 2: note(7) }), slot("c", { 2: note(7) }), slot("d", { 2: note(5) })]]);

describe("noteContext / techniqueBlock", () => {
	it("reads the note and the one before it on the string", () => {
		expect(noteContext(base(), c(1))).toEqual({ fret: 7, muted: false, prev: { fret: 5, muted: false }, maxFret: 24 });
		expect(noteContext(base(), c(0))).toMatchObject({ prev: null });
		expect(noteContext(base(), c(9))).toBeNull();
	});

	it("answers from the registry rule, plus the neck's end for a bend", () => {
		expect(techniqueBlock(base(), c(1), "hammer")).toBeNull();
		expect(techniqueBlock(base(), c(3), "hammer")).toBe("wrong-direction");
		expect(techniqueBlock(base(), c(2), "tie")).toBeNull();
		expect(techniqueBlock(base(), c(0), "pull")).toBe("no-previous-note");
		expect(techniqueBlock(base(), c(1), "bend", 2)).toBeNull();
		const high = setFret(base(), c(1), 23);
		expect(techniqueBlock(high, c(1), "bend", 2)).toBe("off-neck");
		expect(techniqueBlock(high, c(1), "bend", 0.5)).toBeNull();
		expect(techniqueBlock(base(), c(1, 0), "vibrato")).toBe("no-note");
		expect(techniqueBlock(base(), c(9), "accent")).toBe("no-note");
	});
});

describe("setLink / toggleLink", () => {
	it("writes the link and the v1 fields it means", () => {
		const p = setLink(base(), c(1), { kind: "hammer" });
		expect(at(p, c(1))).toMatchObject({ link: { kind: "hammer" }, technique: "hammer-on", tied: false });
	});

	it("a slide takes its v1 direction from the frets", () => {
		expect(at(setLink(base(), c(1), { kind: "slide" }), c(1)).technique).toBe("slide-up");
		expect(at(setLink(base(), c(3), { kind: "slide", picked: true }), c(3))).toMatchObject({
			technique: "slide-down",
			link: { kind: "slide", picked: true },
		});
	});

	it("a tie is `tied` in v1 and clears a technique", () => {
		const p = setLink(setLink(base(), c(2), { kind: "hammer" }), c(2), { kind: "tie" });
		expect(at(p, c(2))).toMatchObject({ link: { kind: "tie" }, tied: true, technique: null });
	});

	it("removing the link leaves a plain note, with no stale v1 technique", () => {
		const p = setLink(setLink(base(), c(1), { kind: "hammer" }), c(1), null);
		const sf = at(p, c(1));
		expect(sf.link).toBeUndefined();
		expect(sf).toMatchObject({ technique: null, tied: false });
	});

	it("toggleLink turns the same kind off and another kind over", () => {
		let p = toggleLink(base(), c(1), "hammer");
		expect(at(p, c(1)).link).toEqual({ kind: "hammer" });
		p = toggleLink(p, c(1), "slide");
		expect(at(p, c(1)).link).toEqual({ kind: "slide" });
		p = toggleLink(p, c(1), "slide");
		expect(at(p, c(1)).link).toBeUndefined();
	});

	it("a link and an effect coexist; v1 shows the link", () => {
		const p = setEffect(setLink(base(), c(1), { kind: "hammer" }), c(1), "vibrato", {});
		expect(at(p, c(1))).toMatchObject({ link: { kind: "hammer" }, effects: { vibrato: {} }, technique: "hammer-on" });
	});
});

describe("setEffect / clearNoteMarks", () => {
	it("writes one effect beside the others and the v1 fields follow", () => {
		let p = setEffect(base(), c(1), "bend", { semitones: 1, release: true });
		p = setEffect(p, c(1), "accent", true);
		expect(at(p, c(1))).toMatchObject({
			effects: { bend: { semitones: 1, release: true }, accent: true },
			technique: "bend-release",
			bendTarget: 1,
			accent: true,
		});
		p = setEffect(p, c(1), "bend", null);
		const sf = at(p, c(1));
		expect(sf.effects).toEqual({ accent: true });
		expect(sf.technique).toBeNull();
		expect(sf.bendTarget).toBeUndefined();
	});

	it("removing the last effect drops the map", () => {
		const p = setEffect(setEffect(base(), c(1), "tap", true), c(1), "tap", null);
		expect(at(p, c(1)).effects).toBeUndefined();
	});

	it("clearNoteMarks removes link and effects, not the fret", () => {
		const p = clearNoteMarks(setEffect(setLink(base(), c(1), { kind: "pull" }), c(1), "staccato", true), c(1));
		expect(at(p, c(1))).toEqual(note(7));
	});
});

describe("keyboard cycles", () => {
	it("B steps ¼ → ½ → full → release → ¼", () => {
		const steps = [undefined, { semitones: 0.5 }, { semitones: 1 }, { semitones: 2 }, { semitones: 2, release: true }];
		expect(steps.map((s) => nextBend(s))).toEqual([
			{ semitones: 0.5 },
			{ semitones: 1 },
			{ semitones: 2 },
			{ semitones: 2, release: true },
			{ semitones: 0.5 },
		]);
		// A bend the cycle does not know (a pre-bend, 1½) starts over.
		expect(nextBend({ semitones: 2, pre: true })).toEqual({ semitones: 0.5 });
		expect(nextBend({ semitones: 1.5 })).toEqual({ semitones: 0.5 });
	});

	it("V toggles vibrato and wide", () => {
		expect(nextVibrato(undefined)).toEqual({});
		expect(nextVibrato({})).toEqual({ wide: true });
		expect(nextVibrato({ wide: true })).toEqual({});
	});
});

describe("v1 setters keep v2 in step", () => {
	it("setTechnique / setTied / setNoteTechnique write link and effects", () => {
		let p = setTechnique(base(), c(1), "hammer-on");
		expect(at(p, c(1)).link).toEqual({ kind: "hammer" });
		p = setTied(p, c(2), true);
		expect(at(p, c(2)).link).toEqual({ kind: "tie" });
		p = setNoteTechnique(p, c(1), "bend-release", 1);
		expect(at(p, c(1))).toMatchObject({ effects: { bend: { semitones: 1, release: true } } });
		expect(at(p, c(1)).link).toBeUndefined();
		p = setTechnique(p, c(1), null);
		expect(at(p, c(1)).effects).toBeUndefined();
	});
});

describe("setPercussion", () => {
	it("is exclusive with a sweep, either way round", () => {
		const t = { measureIndex: 0, slotIndex: 1 };
		let p = setStroke(base(), t, "roll-down");
		p = setPercussion(p, t, { kind: "slap", accent: true });
		expect(p.measures[0].slots[1]).toMatchObject({ percussion: { kind: "slap", accent: true } });
		expect(p.measures[0].slots[1].stroke).toBeUndefined();
		p = setStroke(p, t, "brush-up");
		expect(p.measures[0].slots[1].percussion).toBeUndefined();
		expect(p.measures[0].slots[1].stroke).toBe("brush-up");
		p = setPercussion(p, t, undefined);
		expect(p.measures[0].slots[1].stroke).toBe("brush-up");
	});
});

describe("spans over slots", () => {
	const t = (slotIndex: number, measureIndex = 0) => ({ measureIndex, slotIndex });

	it("one slot on, the next extends the run, a middle one off splits it", () => {
		let p = setSpanOver(base(), "palmMute", [t(0)], true);
		expect(p.spans).toEqual([{ id: "palmMute:a", kind: "palmMute", from: "a", to: "a" }]);
		p = setSpanOver(p, "palmMute", [t(1), t(2)], true);
		expect(p.spans).toEqual([{ id: "palmMute:a", kind: "palmMute", from: "a", to: "c" }]);
		expect([0, 1, 2, 3].map((i) => spanCoversSlot(p, "palmMute", t(i)))).toEqual([true, true, true, false]);
		// The flags follow.
		expect(p.measures[0].slots.map((s) => s.strings[2].palmMute === true)).toEqual([true, true, true, false]);
		p = setSpanOver(p, "palmMute", [t(1)], false);
		expect(p.spans).toEqual([
			{ id: "palmMute:a", kind: "palmMute", from: "a", to: "a" },
			{ id: "palmMute:c", kind: "palmMute", from: "c", to: "c" },
		]);
		expect(p.measures[0].slots.map((s) => s.strings[2].palmMute === true)).toEqual([true, false, true, false]);
	});

	it("other kinds are untouched and the map goes when empty", () => {
		let p = setSpanOver(base(), "letRing", [t(0), t(1)], true);
		p = setSpanOver(p, "palmMute", [t(1)], true);
		expect(p.spans?.map((s) => s.kind)).toEqual(["letRing", "palmMute"]);
		p = setSpanOver(p, "palmMute", [t(1)], false);
		expect(p.spans?.map((s) => s.kind)).toEqual(["letRing"]);
		p = setSpanOver(p, "letRing", [t(0), t(1)], false);
		expect(p.spans).toBeUndefined();
	});

	it("toggleSpanOver: off only when every target is covered", () => {
		let p = toggleSpanOver(base(), "letRing", [t(0)]);
		p = toggleSpanOver(p, "letRing", [t(0), t(1)]); // one bare → on over both
		expect(p.spans).toEqual([{ id: "letRing:a", kind: "letRing", from: "a", to: "b" }]);
		p = toggleSpanOver(p, "letRing", [t(0), t(1)]);
		expect(p.spans).toBeUndefined();
	});

	it("a run crosses the barline", () => {
		const two = pattern([[slot("a", { 2: note(5) }), slot("b", { 2: note(7) })], [slot("c", { 2: note(7) }), slot("d")]]);
		const p = setSpanOver(two, "palmMute", [t(1), t(0, 1)], true);
		expect(p.spans).toEqual([{ id: "palmMute:b", kind: "palmMute", from: "b", to: "c" }]);
		expect(spanTargets(p, p.spans![0])).toEqual([t(1), t(0, 1)]);
	});

	it("is a no-op when nothing changes", () => {
		const p = setSpanOver(base(), "palmMute", [t(0)], true);
		expect(setSpanOver(p, "palmMute", [t(0)], true)).toBe(p);
	});
});

describe("structural edits carry spans", () => {
	const spanned = () => setSpanOver(base(), "palmMute", [{ measureIndex: 0, slotIndex: 1 }, { measureIndex: 0, slotIndex: 2 }], true);
	const t = (slotIndex: number) => ({ measureIndex: 0, slotIndex });

	it("deleting a span's end shrinks it; deleting all of it drops it", () => {
		const p = deleteSlots(spanned(), [t(2)]);
		expect(p.spans).toEqual([{ id: "palmMute:b", kind: "palmMute", from: "b", to: "b" }]);
		expect(deleteSlots(spanned(), [t(1), t(2)]).spans).toEqual([]);
	});

	it("inserting inside a run leaves it covering the new slot; before its start leaves it alone", () => {
		const p = insertSlots(spanned(), [t(1)], "after");
		expect(p.measures[0].slots).toHaveLength(5);
		expect(p.spans).toEqual([{ id: "palmMute:b", kind: "palmMute", from: "b", to: "c" }]);
		expect([1, 2, 3].map((i) => spanCoversSlot(p, "palmMute", t(i)))).toEqual([true, true, true]);
		expect(insertSlots(spanned(), [t(1)], "before").spans).toEqual(spanned().spans);
	});

	it("a duplicate inside the run is covered", () => {
		const p = duplicateSlots(spanned(), [t(1)]);
		expect([1, 2, 3].map((i) => spanCoversSlot(p, "palmMute", t(i)))).toEqual([true, true, true]);
	});

	it("split keeps the head's id so the span stays; merge keeps the first slot's", () => {
		const s = spanned();
		const split = withMeasures(s, splitSlot(s.measures, 0, 2, "eighth", [4, 4]));
		expect(split.measures[0].slots[2].id).toBe("c");
		expect(split.spans).toEqual(s.spans);
		// b + c + c's tail make a half; c holds a note, so the merge asks first.
		const res = mergeSlots(split.measures, 0, 1, "half", [4, 4]);
		const merged = withMeasures(split, res.type === "ok" ? res.measures : res.pendingMeasures);
		expect(merged.measures[0].slots[1].id).toBe("b");
		// `c` went into the merge: the span is the one slot now.
		expect(merged.spans).toEqual([{ id: "palmMute:b", kind: "palmMute", from: "b", to: "b" }]);
	});

	it("cloning a measure copies the spans inside it onto the copy", () => {
		const p = cloneMeasureInPattern(spanned(), 0, "m-copy");
		expect(p.measures).toHaveLength(2);
		const copy = p.measures[1];
		expect(p.spans).toHaveLength(2);
		expect(p.spans![1]).toEqual({
			id: `palmMute:${copy.slots[1].id}`,
			kind: "palmMute",
			from: copy.slots[1].id,
			to: copy.slots[2].id,
		});
		expect(copy.slots.map((s) => s.strings[2].palmMute === true)).toEqual([false, true, true, false]);
	});

	it("a span running out of the measure is not copied", () => {
		const two = pattern([[slot("a", { 2: note(5) }), slot("b", { 2: note(7) })], [slot("c", { 2: note(7) }), slot("d")]]);
		const s = setSpanOver(two, "letRing", [{ measureIndex: 0, slotIndex: 1 }, { measureIndex: 1, slotIndex: 0 }], true);
		expect(cloneMeasureInPattern(s, 0).spans).toHaveLength(1);
	});

	it("shifting a measure's strings moves a string-bound span with them", () => {
		const s = pattern([[slot("a", { 2: note(5) }), slot("b", { 2: note(7) })]], {
			spans: [{ id: "x", kind: "letRing", from: "a", to: "b", strings: [2] }],
		});
		const p = shiftMeasureStrings(s, 0, 1);
		expect(p.spans).toEqual([{ id: "x", kind: "letRing", from: "a", to: "b", strings: [3] }]);
		expect(p.measures[0].slots[0].strings[3]).toMatchObject({ fret: 5, letRing: true });
		expect(p.measures[0].slots[0].strings[2].letRing).toBeUndefined();
	});

	it("withMeasures is the identity for the same measures", () => {
		const s = spanned();
		expect(withMeasures(s, s.measures)).toBe(s);
	});

	it("every structural edit leaves a v1 view a v1 reader can use", () => {
		const s = spanned();
		for (const p of [deleteSlots(s, [t(0)]), insertSlots(s, [t(3)], "after"), cloneMeasureInPattern(s, 0)]) {
			for (const m of p.measures) for (const sl of m.slots) for (const sf of sl.strings) {
				expect(typeof sf.tied).toBe("boolean");
				expect("technique" in sf).toBe(true);
			}
			expect(stripV2(p).spans).toBeUndefined();
		}
	});
});
