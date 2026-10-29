import { describe, expect, it } from "vitest";
import { makeEmptySlot, setFret, setStroke } from "@/lib/fingerpickEdit";
import { setPercussion, toggleSpanOver } from "@/lib/fingerpickTechniqueEdit";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { EFFECT_DEFS, LINK_DEFS, PERCUSSION_DEFS, SPAN_DEFS } from "@/lib/techniqueRegistry";
import { BLOCK_REASON } from "@/lib/tabEditorCursor";
import {
	INSPECTOR_HITS,
	effectOptions,
	hitOf,
	linkOptions,
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

describe("sectionsFor", () => {
	it("keeps the one-note parts for a single slot", () => {
		expect(sectionsFor(1)).toEqual({ note: true, effects: true, spans: true });
		expect(sectionsFor(3)).toEqual({ note: false, effects: false, spans: true });
	});
});
