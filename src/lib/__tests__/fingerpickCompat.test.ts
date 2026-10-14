import { describe, it, expect } from "vitest";

import type { BeatSlot, FingerpickPattern, StringFret, Technique } from "@/lib/fingerpickTypes";
import {
	flagsFromSpans,
	isV2Note,
	noteFromV2,
	noteToV2,
	spansFromFlags,
	stripV1,
	stripV2,
	syncNote,
	syncTechniqueFields,
} from "@/lib/fingerpickCompat";
import { migratePattern } from "@/lib/tabImport";

const silent = (): StringFret => ({ fret: null, technique: null, tied: false, muted: false });
const note = (fret: number, extra: Partial<StringFret> = {}): StringFret => ({
	fret,
	technique: null,
	tied: false,
	muted: false,
	...extra,
});
const slot = (id: string, notes: Record<number, StringFret>, extra: Partial<BeatSlot> = {}): BeatSlot => {
	const strings = [silent(), silent(), silent(), silent(), silent(), silent()] as BeatSlot["strings"];
	for (const [i, sf] of Object.entries(notes)) strings[Number(i)] = sf;
	return { id, duration: "quarter", strings, ...extra };
};
const pattern = (measures: BeatSlot[][], extra: Partial<FingerpickPattern> = {}): FingerpickPattern => ({
	id: "p",
	name: "t",
	bpm: 80,
	timeSignature: [4, 4],
	measures: measures.map((slots, i) => ({ id: `m${i}`, slots })),
	...extra,
});

describe("noteToV2 — every v1 technique value", () => {
	const cases: [Technique, Partial<StringFret>, ReturnType<typeof noteToV2>][] = [
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
		[null, {}, {}],
	];
	it.each(cases)("%s %o → %o", (technique, extra, expected) => {
		expect(noteToV2(note(7, { technique, ...extra }))).toEqual(expected);
	});

	it("maps the flags, and tie wins over a technique", () => {
		expect(noteToV2(note(5, { staccato: true, accent: true, ghostNote: true, tremoloPickingSpeed: "16th", pickStroke: "up" }))).toEqual({
			effects: { staccato: true, accent: true, ghost: true, tremolo: { speed: "16th" }, pick: { direction: "up" } },
		});
		expect(noteToV2(note(5, { tied: true, technique: "hammer-on" }))).toEqual({ link: { kind: "tie" } });
	});
});

describe("noteFromV2 — back to one technique", () => {
	it("a link wins over effects, then the first effect by priority", () => {
		expect(noteFromV2(note(7, { link: { kind: "hammer" }, effects: { vibrato: {} } }), 5)).toMatchObject({ technique: "hammer-on" });
		expect(noteFromV2(note(7, { effects: { vibrato: {}, bend: { semitones: 1 } } }), null)).toMatchObject({
			technique: "bend-half",
			bendTarget: 1,
		});
		expect(noteFromV2(note(7, { link: { kind: "tie" } }), 7)).toMatchObject({ technique: null, tied: true });
	});

	it("a slide reads its direction from the frets", () => {
		expect(noteFromV2(note(7, { link: { kind: "slide" } }), 5).technique).toBe("slide-up");
		expect(noteFromV2(note(5, { link: { kind: "slide" } }), 7).technique).toBe("slide-down");
		expect(noteFromV2(note(5, { link: { kind: "slide" } }), null).technique).toBe("slide-up");
	});

	it("bends write the v1 value their parameters mean", () => {
		expect(noteFromV2(note(7, { effects: { bend: { semitones: 1.5 } } }), null)).toMatchObject({ technique: "bend-full", bendTarget: 1.5 });
		expect(noteFromV2(note(7, { effects: { bend: { semitones: 2, pre: true } } }), null).technique).toBe("pre-bend");
		expect(noteFromV2(note(7, { effects: { bend: { semitones: 2, pre: true, release: true } } }), null).technique).toBe("pre-bend-release");
	});
});

describe("syncNote", () => {
	it("a v1 note gains v2 fields and keeps its own", () => {
		const s = syncNote(note(7, { technique: "bend-release", bendTarget: 1 }), null);
		expect(s).toMatchObject({ technique: "bend-release", bendTarget: 1, effects: { bend: { semitones: 1, release: true } } });
		expect(isV2Note(s)).toBe(true);
	});

	it("a v2 note rewrites its v1 fields from the v2 ones", () => {
		const stale = note(7, { technique: "hammer-on", effects: { vibrato: { wide: true } } });
		expect(syncNote(stale, 5)).toMatchObject({ technique: "vibrato-wide", tied: false, effects: { vibrato: { wide: true } } });
		expect("link" in syncNote(stale, 5)).toBe(false);
	});

	it("is idempotent", () => {
		const once = syncNote(note(7, { technique: "pre-bend", bendTarget: 1, accent: true }), 5);
		expect(syncNote(once, 5)).toEqual(once);
	});
});

describe("spansFromFlags / flagsFromSpans", () => {
	it("one span per run, across a barline, with a rest ending it", () => {
		const p = pattern([
			[slot("a", { 4: note(0, { palmMute: true }) }), slot("b", { 4: note(0, { palmMute: true }) })],
			[slot("c", { 4: note(2, { palmMute: true }) }), slot("r", {}, { isRest: true }), slot("d", { 4: note(2, { palmMute: true }) })],
		]);
		const spans = spansFromFlags(p);
		expect(spans.map((s) => [s.kind, s.from, s.to, s.strings])).toEqual([
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
		const spans = spansFromFlags(p);
		expect(spans.map((s) => [s.from, s.to, s.strings])).toEqual([
			["a", "b", [0]],
			["c", "c", undefined],
		]);
	});

	it("a grace slot is transparent", () => {
		const p = pattern([
			[
				slot("a", { 0: note(3, { letRing: true }) }),
				slot("g", { 0: note(5) }, { isGraceNote: true }),
				slot("b", { 0: note(3, { letRing: true }) }),
			],
		]);
		expect(spansFromFlags(p).map((s) => [s.from, s.to])).toEqual([["a", "b"]]);
	});

	it("flagsFromSpans writes the flags a span means and clears the rest", () => {
		const p = pattern([[slot("a", { 0: note(3), 4: note(0, { letRing: true }) }), slot("b", { 0: note(3) })]], {
			spans: [{ id: "s", kind: "palmMute", from: "a", to: "b", strings: [0] }],
		});
		const out = flagsFromSpans(p);
		expect(out.measures[0].slots[0].strings[0]).toMatchObject({ palmMute: true });
		expect(out.measures[0].slots[0].strings[4].palmMute).toBeUndefined();
		expect(out.measures[0].slots[0].strings[4].letRing).toBeUndefined(); // no span → cleared
		expect(out.measures[0].slots[1].strings[0]).toMatchObject({ palmMute: true });
	});

	it("round-trips every flag layout through spans", () => {
		const p = pattern([
			[
				slot("a", { 0: note(3, { letRing: true }), 4: note(0, { palmMute: true }) }),
				slot("b", { 0: note(3, { letRing: true, palmMute: true }), 4: note(0, { palmMute: true }) }),
				slot("c", { 0: note(3) }),
			],
		]);
		const spans = spansFromFlags(p);
		const back = flagsFromSpans({ ...p, spans });
		expect(stripV2(back)).toEqual(stripV2(p));
	});
});

describe("syncTechniqueFields / migratePattern", () => {
	const v1 = (): FingerpickPattern =>
		pattern([
			[
				slot("a", { 2: note(5, { letRing: true }) }),
				slot("b", { 2: note(7, { technique: "slide-up", letRing: true }) }),
				slot("c", { 2: note(7, { technique: "bend-release", bendTarget: 1, accent: true }) }),
				slot("d", { 2: note(7, { tied: true }) }),
			],
		]);

	it("stamps schemaVersion 2 and fills link, effects and spans from v1", () => {
		const m = syncTechniqueFields(v1());
		expect(m.schemaVersion).toBe(2);
		const s = m.measures[0].slots;
		expect(s[1].strings[2].link).toEqual({ kind: "slide" });
		expect(s[2].strings[2].effects).toEqual({ bend: { semitones: 1, release: true }, accent: true });
		expect(s[3].strings[2].link).toEqual({ kind: "tie" });
		expect(m.spans?.map((x) => [x.kind, x.from, x.to])).toEqual([["letRing", "a", "b"]]);
	});

	it("leaves every v1 field exactly as it was (the golden property)", () => {
		expect(stripV2(syncTechniqueFields(v1()))).toEqual(v1());
	});

	it("is idempotent", () => {
		const once = syncTechniqueFields(v1());
		expect(syncTechniqueFields(once)).toEqual(once);
	});

	it("with spans present, the flags follow the spans", () => {
		const p = pattern([[slot("a", { 2: note(5, { letRing: true }) }), slot("b", { 2: note(5) })]], {
			spans: [{ id: "s", kind: "letRing", from: "b", to: "b" }],
		});
		const m = syncTechniqueFields(p);
		expect(m.measures[0].slots[0].strings[2].letRing).toBeUndefined();
		expect(m.measures[0].slots[1].strings[2].letRing).toBe(true);
	});

	it("migratePattern passes v2 and non-patterns through untouched", () => {
		const v2 = syncTechniqueFields(v1());
		expect(migratePattern(v2)).toBe(v2);
		expect(migratePattern("nope")).toBe("nope");
		expect(migratePattern({ measures: "x" })).toEqual({ measures: "x" });
		expect(migratePattern(null)).toBeNull();
	});

	it("migratePattern turns a v1 object into v2", () => {
		const out = migratePattern(v1()) as FingerpickPattern;
		expect(out.schemaVersion).toBe(2);
		expect(out.measures[0].slots[2].strings[2].effects?.bend).toEqual({ semitones: 1, release: true });
	});

	it("stripV1 leaves only the v2 fields", () => {
		const out = stripV1(syncTechniqueFields(v1()));
		const sf = out.measures[0].slots[2].strings[2] as Record<string, unknown>;
		expect(sf.technique).toBeUndefined();
		expect(sf.bendTarget).toBeUndefined();
		expect(sf.effects).toBeDefined();
	});
});
