import { describe, expect, it } from "vitest";
import { makeEmptySlot, setFret, setStroke } from "@/lib/fingerpickEdit";
import { setEffect, setPercussion, toggleSpanOver } from "@/lib/fingerpickTechniqueEdit";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { EFFECT_DEFS, LINK_DEFS, PERCUSSION_DEFS, SPAN_DEFS } from "@/lib/techniqueRegistry";
import { BLOCK_REASON } from "@/lib/tabEditorCursor";
import type { ChordVoicing } from "@/lib/chordVoicing";
import {
	INSPECTOR_HITS,
	applyPick,
	applySweep,
	replaceWithShape,
	effectOptions,
	hitOf,
	linkOptions,
	pickOf,
	runSounds,
	sectionsFor,
	spanOptions,
	strokeOf,
} from "@/lib/tabEditorInspector";

function tab(): FingerpickPattern {
	return {
		id: "t",
		name: "T",
		bpm: 90,
		timeSignature: [4, 4],
		measures: [{ id: "m", slots: [0, 1, 2, 3].map(() => makeEmptySlot("quarter")) }],
	};
}
const at = (slotIndex: number, stringIndex = 1) => ({ measureIndex: 0, slotIndex, stringIndex });
const run = [
	{ measureIndex: 0, slotIndex: 0 },
	{ measureIndex: 0, slotIndex: 1 },
];

describe("the inspector's lists are the registry's", () => {
	it("offers every link, every drawn or played effect, every span and every hit", () => {
		const p = setFret(tab(), at(0), 3);
		expect(linkOptions(p, at(0)).map((o) => o.kind)).toEqual(LINK_DEFS.map((t) => t.kind));
		expect(effectOptions(p, at(0)).map((o) => o.kind)).toEqual(EFFECT_DEFS.filter((t) => t.render || t.audio).map((t) => t.kind));
		expect(spanOptions(p, run).map((o) => o.kind)).toEqual(SPAN_DEFS.filter((t) => t.render || t.audio).map((t) => t.kind));
		expect(INSPECTOR_HITS.map((t) => t.kind)).toEqual(PERCUSSION_DEFS.map((t) => t.kind));
	});
});

describe("options say why they are blocked", () => {
	it("blocks a hammer-on with no note before it, and an open string's bend", () => {
		const p = setFret(tab(), at(0), 0);
		const hammer = linkOptions(p, at(0)).find((o) => o.kind === "hammer");
		expect(hammer).toMatchObject({ on: false, reason: BLOCK_REASON["no-previous-note"] });
		const bend = effectOptions(p, at(0)).find((o) => o.kind === "bend");
		expect(bend?.reason).toBe(BLOCK_REASON["open-string"]);
		// Nothing is written: every effect needs a note.
		expect(effectOptions(tab(), at(0)).every((o) => o.reason === BLOCK_REASON["no-note"])).toBe(true);
	});

	it("reads what is on", () => {
		const p = setFret(setFret(tab(), at(0), 2), at(1), 4);
		const withHammer = { ...p };
		withHammer.measures[0].slots[1].strings[1] = { ...withHammer.measures[0].slots[1].strings[1], link: { kind: "hammer" } };
		expect(linkOptions(withHammer, at(1)).find((o) => o.kind === "hammer")).toMatchObject({ on: true, reason: null });
	});
});

describe("a run's shared state", () => {
	it("reads one sweep or a mix", () => {
		const one = setStroke(setStroke(tab(), run[0], "roll-down"), run[1], "roll-down");
		expect(strokeOf(one, run)).toEqual({ kind: "one", value: "roll-down" });
		expect(strokeOf(setStroke(tab(), run[0], "roll-down"), run)).toEqual({ kind: "mixed" });
		expect(strokeOf(tab(), run)).toEqual({ kind: "one", value: "none" });
	});

	it("reads one hit, its accent, or a mix", () => {
		const p = setPercussion(setPercussion(tab(), run[0], { kind: "slap", accent: true }), run[1], { kind: "slap" });
		expect(hitOf(p, run)).toEqual({ hit: { kind: "one", value: "slap" }, accent: { kind: "mixed" } });
		expect(hitOf(setPercussion(tab(), run[0], { kind: "bodyTap" }), run).hit).toEqual({ kind: "mixed" });
	});

	it("lays a span on only when the whole run is under it", () => {
		const half = toggleSpanOver(tab(), "palmMute", [run[0]]);
		expect(spanOptions(half, run).find((o) => o.kind === "palmMute")?.on).toBe(false);
		const whole = toggleSpanOver(tab(), "palmMute", run);
		expect(spanOptions(whole, run).find((o) => o.kind === "palmMute")?.on).toBe(true);
	});
});

describe("a slot's pick stroke (#440)", () => {
	const chord = (p: FingerpickPattern, slotIndex: number) => setFret(setFret(p, at(slotIndex, 1), 1), at(slotIndex, 4), 3);
	const notesOf = (p: FingerpickPattern, slotIndex: number) => p.measures[0].slots[slotIndex].strings;

	it("goes on every sounding note of each slot of the run, and comes off the same way", () => {
		const p = applyPick(chord(chord(tab(), 0), 1), run, "down");
		for (const slot of [0, 1]) {
			expect(notesOf(p, slot).map((sf) => sf.effects?.pick?.direction)).toEqual([undefined, "down", undefined, undefined, "down", undefined]);
		}
		expect(pickOf(p, run)).toEqual({ kind: "one", value: "down" });
		const off = applyPick(p, run, null);
		expect(notesOf(off, 0).every((sf) => sf.effects === undefined)).toBe(true);
		expect(pickOf(off, run)).toEqual({ kind: "one", value: "none" });
	});

	it("turns one direction into the other and keeps a note's other effects", () => {
		const vibrato = setEffect(chord(tab(), 0), at(0, 1), "vibrato", {});
		const p = applyPick(applyPick(vibrato, [run[0]], "up"), [run[0]], "down");
		expect(notesOf(p, 0)[1].effects).toEqual({ vibrato: {}, pick: { direction: "down" } });
		expect(notesOf(applyPick(p, [run[0]], null), 0)[1].effects).toEqual({ vibrato: {} });
	});

	it("reads one marked note as the column's mark, and a run of two directions as a mix", () => {
		const one = setFret(chord(tab(), 0), at(0, 2), 0);
		const marked = applyPick(one, [run[0]], "up");
		const lone = setFret(marked, at(0, 3), 2); // written after: carries no mark, the column still does
		expect(pickOf(lone, [run[0]])).toEqual({ kind: "one", value: "up" });
		const mixed = applyPick(chord(lone, 1), [run[1]], "down");
		expect(pickOf(mixed, run)).toEqual({ kind: "mixed" });
	});

	it("leaves out a slot with nothing sounding, and has nothing to mark on a silent run", () => {
		const p = applyPick(chord(tab(), 0), run, "down");
		expect(notesOf(p, 1).every((sf) => sf.effects === undefined)).toBe(true);
		expect(pickOf(p, run)).toEqual({ kind: "one", value: "down" });
		expect(runSounds(tab(), run)).toBe(false);
		expect(pickOf(tab(), run)).toEqual({ kind: "one", value: "none" });
	});
});

describe("sectionsFor", () => {
	it("keeps the one-note parts for a single slot", () => {
		expect(sectionsFor(1)).toEqual({ note: true, effects: true, spans: true });
		expect(sectionsFor(3)).toEqual({ note: false, effects: false, spans: true });
	});
});

describe("applySweep", () => {
	// A C shape, low E to high e: x 3 2 0 1 0.
	const C: ChordVoicing = { id: "c", label: null, start_fret: 1, barre_fret: null, capo: false, frets: "x32010", fingers: "032010" };
	const voicingAt = () => C;

	it("fills an empty slot from the shape as it rolls", () => {
		const out = applySweep(tab(), [run[0]], "roll-down", voicingAt);
		const strings = out.pattern.measures[0].slots[0].strings.map((s) => s.fret);
		expect(strings).toEqual([0, 1, 0, 2, 3, null]);
		expect(out.pattern.measures[0].slots[0].stroke).toBe("roll-down");
		expect(out.offShape).toEqual([]);
	});

	it("leaves notes outside the shape alone and asks about them", () => {
		const p = setFret(tab(), { measureIndex: 0, slotIndex: 0, stringIndex: 0 }, 7);
		const out = applySweep(p, [run[0]], "brush-up", voicingAt);
		expect(out.offShape).toEqual([run[0]]);
		expect(out.pattern.measures[0].slots[0].strings[0].fret).toBe(7);
		const replaced = replaceWithShape(out.pattern, out.offShape, voicingAt);
		expect(replaced.measures[0].slots[0].strings.map((s) => s.fret)).toEqual([0, 1, 0, 2, 3, null]);
	});

	it("turning it off changes only the sweep", () => {
		const rolled = applySweep(tab(), [run[0]], "roll-down", voicingAt).pattern;
		const off = applySweep(rolled, [run[0]], undefined, voicingAt);
		expect(off.pattern.measures[0].slots[0].stroke).toBeUndefined();
		expect(off.pattern.measures[0].slots[0].strings[1].fret).toBe(1);
	});
});
