import { describe, it, expect } from "vitest";

import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { legacyNoteMarks, migratePattern, spansFromFlags } from "@/lib/tabImport/migratePattern";

type Raw = Record<string, unknown>;

const silent = (): Raw => ({ fret: null, technique: null, tied: false, muted: false });
const note = (fret: number, extra: Raw = {}): Raw => ({ fret, technique: null, tied: false, muted: false, ...extra });
const slot = (id: string, notes: Record<number, Raw>, extra: Raw = {}): Raw => {
	const strings = [silent(), silent(), silent(), silent(), silent(), silent()];
	for (const [i, sf] of Object.entries(notes)) strings[Number(i)] = sf;
	return { id, duration: "quarter", strings, ...extra };
};
const pattern = (measures: Raw[][], extra: Raw = {}): Raw => ({
	id: "p",
	name: "t",
	bpm: 80,
	timeSignature: [4, 4],
	measures: measures.map((slots, i) => ({ id: `m${i}`, slots })),
	...extra,
});

describe("legacyNoteMarks — every v1 technique value", () => {
	const cases: [string | null, Raw, ReturnType<typeof legacyNoteMarks>][] = [
		["hammer-on", {}, { link: { kind: "hammer" } }],
		["pull-off", {}, { link: { kind: "pull" } }],
		["slide-up", {}, { link: { kind: "slide" } }],
		["slide-down", {}, { link: { kind: "slide" } }],
		["bend-full", {}, { effects: { bend: { semitones: 2 } } }],
		["bend-half", {}, { effects: { bend: { semitones: 1 } } }],
		["bend-quarter", {}, { effects: { bend: { semitones: 0.5 } } }],
		["bend-release", { bendTarget: 1 }, { effects: { bend: { semitones: 1, release: true } } }],
		["bend-release", {}, { effects: { bend: { semitones: 2, release: true } } }],
		["pre-bend", { bendTarget: 0.5 }, { effects: { bend: { semitones: 0.5, pre: true } } }],
		["pre-bend-release", {}, { effects: { bend: { semitones: 2, pre: true, release: true } } }],
		["vibrato", {}, { effects: { vibrato: {} } }],
		["vibrato-wide", {}, { effects: { vibrato: { wide: true } } }],
		["vibrato-bar", {}, { effects: { vibrato: { bar: true } } }],
		["tapping", {}, { effects: { tap: true } }],
		["trill", {}, { effects: { trill: {} } }],
		["harmonic-natural", {}, { effects: { harmonic: { type: "natural" } } }],
		["harmonic-artificial", {}, { effects: { harmonic: { type: "artificial" } } }],
		["whammy-dive", {}, { effects: { whammy: { kind: "dive" } } }],
		["whammy-pull", {}, { effects: { whammy: { kind: "pull" } } }],
		["pick-scrape", {}, { effects: { scrape: true } }],
		["grace-note", {}, {}],
		["totally-fake", {}, {}],
		[null, {}, {}],
	];
	it.each(cases)("%s %o → %o", (technique, extra, expected) => {
		expect(legacyNoteMarks({ fret: 7, technique, tied: false, muted: false, ...extra })).toEqual(expected);
	});

	it("maps the flags, and tie wins over a technique", () => {
		expect(legacyNoteMarks({ fret: 5, staccato: true, accent: true, ghostNote: true, tremoloPickingSpeed: "16th", pickStroke: "up" })).toEqual({
			effects: { staccato: true, accent: true, ghost: true, tremolo: { speed: "16th" }, pick: { direction: "up" } },
		});
		expect(legacyNoteMarks({ fret: 5, tied: true, technique: "hammer-on" })).toEqual({ link: { kind: "tie" } });
	});
});

describe("spansFromFlags", () => {
	const measures = (p: Raw) => p.measures as Parameters<typeof spansFromFlags>[0];

	it("one span per run, across a barline, with a rest ending it", () => {
		const p = pattern([
			[slot("a", { 4: note(0, { palmMute: true }) }), slot("b", { 4: note(0, { palmMute: true }) })],
			[slot("c", { 4: note(2, { palmMute: true }) }), slot("r", {}, { isRest: true }), slot("d", { 4: note(2, { palmMute: true }) })],
		]);
		expect(spansFromFlags(measures(p)).map((s) => [s.kind, s.from, s.to, s.strings])).toEqual([
			["palmMute", "a", "c", undefined],
			["palmMute", "d", "d", undefined],
		]);
	});

	it("writes `strings` when the flag covers only some of a slot's sounding strings, and splits runs when the set changes", () => {
		const p = pattern([
			[
				slot("a", { 0: note(3, { letRing: true }), 4: note(0) }),
				slot("b", { 0: note(3, { letRing: true }), 4: note(0) }),
				slot("c", { 0: note(3, { letRing: true }), 4: note(0, { letRing: true }) }),
			],
		]);
		expect(spansFromFlags(measures(p)).map((s) => [s.from, s.to, s.strings])).toEqual([
			["a", "b", [0]],
			["c", "c", undefined],
		]);
	});

	it("a run over whole slots goes on across notes on different strings", () => {
		const p = pattern([[slot("a", { 5: note(3, { letRing: true }) }), slot("b", { 1: note(3, { letRing: true }) })]]);
		expect(spansFromFlags(measures(p))).toEqual([{ id: "letRing:a", kind: "letRing", from: "a", to: "b" }]);
	});

	it("a grace slot is transparent", () => {
		const p = pattern([
			[slot("a", { 0: note(3, { letRing: true }) }), slot("g", { 0: note(5) }, { isGraceNote: true }), slot("b", { 0: note(3, { letRing: true }) })],
		]);
		expect(spansFromFlags(measures(p)).map((s) => [s.from, s.to])).toEqual([["a", "b"]]);
	});
});

describe("migratePattern", () => {
	const v1 = (): Raw =>
		pattern([
			[
				slot("a", { 2: note(5, { letRing: true }) }),
				slot("b", { 2: note(7, { technique: "slide-up", letRing: true }) }),
				slot("c", { 2: note(7, { technique: "bend-release", bendTarget: 1, accent: true }) }),
				slot("d", { 2: note(7, { tied: true }) }),
			],
		]);

	it("stamps schemaVersion 2 and writes link, effects and spans, with nothing of v1 left on a note", () => {
		const m = migratePattern(v1()) as FingerpickPattern;
		expect(m.schemaVersion).toBe(2);
		const s = m.measures[0].slots;
		expect(s[0].strings[2]).toEqual({ fret: 5, muted: false });
		expect(s[1].strings[2]).toEqual({ fret: 7, muted: false, link: { kind: "slide" } });
		expect(s[2].strings[2]).toEqual({ fret: 7, muted: false, effects: { bend: { semitones: 1, release: true }, accent: true } });
		expect(s[3].strings[2]).toEqual({ fret: 7, muted: false, link: { kind: "tie" } });
		expect(s[0].strings[0]).toEqual({ fret: null, muted: false });
		expect(m.spans).toEqual([{ id: "letRing:a", kind: "letRing", from: "a", to: "b" }]);
	});

	it("keeps a note already written in v2 and drops its v1 fields; keeps the pattern's own spans", () => {
		const raw = pattern([[slot("a", { 2: { fret: 7, muted: false, technique: "hammer-on", effects: { vibrato: {} }, letRing: true } })]], {
			spans: [{ id: "x", kind: "palmMute", from: "a", to: "a" }],
		});
		const m = migratePattern(raw) as FingerpickPattern;
		expect(m.measures[0].slots[0].strings[2]).toEqual({ fret: 7, muted: false, effects: { vibrato: {} } });
		expect(m.spans).toEqual([
			{ id: "x", kind: "palmMute", from: "a", to: "a" },
			{ id: "letRing:a", kind: "letRing", from: "a", to: "a" },
		]);
	});

	it("passes v2 and non-patterns through untouched", () => {
		const v2 = migratePattern(v1());
		expect(migratePattern(v2)).toBe(v2);
		expect(migratePattern("nope")).toBe("nope");
		expect(migratePattern({ measures: "x" })).toEqual({ measures: "x" });
		expect(migratePattern(null)).toBeNull();
	});

	it("keeps the rest of the slot and the pattern as they were", () => {
		const raw = pattern([[slot("a", { 2: note(5) }, { chord: { root: "C", suffix: "major", voicingId: null }, stroke: "roll-down" })]], { capo: 2, description: "d" });
		const m = migratePattern(raw) as FingerpickPattern;
		expect(m.measures[0].slots[0]).toMatchObject({ chord: { root: "C" }, stroke: "roll-down" });
		expect(m.capo).toBe(2);
		expect(m.description).toBe("d");
	});
});
