import { describe, expect, it } from "vitest";
import { INDEX } from "@/lib/assistant/tab/__tests__/fixtures";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import {
	importTab,
	parseMeter,
	patternToImportBars,
	toImportedTabDraft,
	uncertainDescription,
	type ImportBar,
	type ImportTabInput,
} from "@/lib/mcp/importTab";

/** One bar of 4/4: an Am arpeggio in eighths, thumb on the A string. */
const AM_BAR: ImportBar = {
	slots: [
		{ duration: "eighth", notes: [{ string: 5, fret: 0 }], chord: "Am" },
		{ duration: "eighth", notes: [{ string: 3, fret: 2 }] },
		{ duration: "eighth", notes: [{ string: 2, fret: 1 }] },
		{ duration: "eighth", notes: [{ string: 1, fret: 0 }] },
		{ duration: "eighth", notes: [{ string: 2, fret: 1 }] },
		{ duration: "eighth", notes: [{ string: 3, fret: 2 }] },
		{ duration: "eighth", notes: [{ string: 2, fret: 1 }] },
		{ duration: "eighth", notes: [{ string: 1, fret: 0 }] },
	],
};

const input = (over: Partial<ImportTabInput> = {}): ImportTabInput => ({
	name: "Am arpeggio",
	timeSignature: "4/4",
	bpm: 72,
	bars: [AM_BAR],
	...over,
});

describe("parseMeter", () => {
	it("reads the meters the app plays and nothing else", () => {
		expect(parseMeter("4/4")).toEqual([4, 4]);
		expect(parseMeter(" 6 / 8 ")).toEqual([6, 8]);
		expect(parseMeter("5/4")).toBeNull();
		expect(parseMeter("four four")).toBeNull();
	});
});

describe("toImportedTabDraft", () => {
	it("puts each note on its string, 1 = high e", () => {
		const { draft, errors, warnings } = toImportedTabDraft(input(), INDEX);
		expect(errors).toEqual([]);
		expect(warnings).toEqual([]);
		const slots = (draft.measures as { slots: { strings: { fret: number | null }[] }[] }[])[0].slots;
		expect(slots[0].strings.map((s) => s.fret)).toEqual([null, null, null, null, 0, null]);
		expect(slots[2].strings.map((s) => s.fret)).toEqual([null, 1, null, null, null, null]);
	});

	it("resolves a printed chord word through the library and drops one it lacks", () => {
		const { draft, warnings } = toImportedTabDraft(
			input({ bars: [{ ...AM_BAR, slots: [{ ...AM_BAR.slots[0], chord: "Zm" }, ...AM_BAR.slots.slice(1)] }] }),
			INDEX,
		);
		const slots = (draft.measures as { slots: { chord?: unknown }[] }[])[0].slots;
		expect(slots[0].chord).toBeUndefined();
		expect(warnings.map((w) => w.code)).toEqual(["UNKNOWN_CHORD"]);

		const resolved = toImportedTabDraft(input(), INDEX);
		expect((resolved.draft.measures as { slots: { chord?: unknown }[] }[])[0].slots[0].chord).toEqual({
			root: "A",
			suffix: "minor",
			voicingId: null,
		});
	});

	it("is an error when a bar overflows its meter, a warning when it runs short", () => {
		const long = toImportedTabDraft(
			input({ bars: [{ slots: [...AM_BAR.slots, { duration: "quarter", notes: [{ string: 1, fret: 3 }] }] }] }),
			INDEX,
		);
		expect(long.errors.map((e) => e.code)).toEqual(["BAR_OVERFULL"]);
		expect(long.errors[0].message).toMatch(/Bar 1 holds 5 quarter notes but 4\/4 holds 4/);

		const short = toImportedTabDraft(input({ bars: [{ slots: AM_BAR.slots.slice(0, 3) }] }), INDEX);
		expect(short.errors).toEqual([]);
		expect(short.warnings.map((w) => w.code)).toEqual(["BAR_UNDERFULL"]);
	});

	it("is an error when one slot strikes the same string twice", () => {
		const { errors } = toImportedTabDraft(
			input({
				bars: [
					{
						slots: [
							{
								duration: "whole",
								notes: [
									{ string: 1, fret: 0 },
									{ string: 1, fret: 3 },
								],
							},
						],
					},
				],
			}),
			INDEX,
		);
		expect(errors.map((e) => e.code)).toEqual(["DUPLICATE_STRING"]);
	});

	it("is an error for a meter the app does not play", () => {
		const { errors } = toImportedTabDraft(input({ timeSignature: "7/8" }), INDEX);
		expect(errors.map((e) => e.code)).toEqual(["UNSUPPORTED_METER"]);
	});

	it("plays an unmarked empty slot as a rest and says so", () => {
		const { draft, warnings } = toImportedTabDraft(
			input({ bars: [{ slots: [{ duration: "whole", notes: [] }] }] }),
			INDEX,
		);
		expect((draft.measures as { slots: { isRest?: boolean }[] }[])[0].slots[0].isRest).toBe(true);
		expect(warnings.map((w) => w.code)).toEqual(["EMPTY_SLOT"]);
	});

	it("keeps the uncertain places on the description and the capo on the draft", () => {
		const { draft } = toImportedTabDraft(input({ uncertain: ["bar 1, slot 2: fret 2 or 3", "  "], capo: 2 }), INDEX);
		expect(draft.description).toBe(uncertainDescription(["bar 1, slot 2: fret 2 or 3"]));
		expect((draft as { capo?: number }).capo).toBe(2);
		expect(toImportedTabDraft(input(), INDEX).draft.description).toBeUndefined();
	});
});

describe("importTab", () => {
	it("makes a pattern the validator accepts, with the tempo and meter given", () => {
		const result = importTab(input({ timeSignature: "6/8", bpm: 60, bars: [{ slots: AM_BAR.slots.slice(0, 6) }] }), INDEX);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.pattern.name).toBe("Am arpeggio");
		expect(result.pattern.bpm).toBe(60);
		expect(result.pattern.timeSignature).toEqual([6, 8]);
		expect(result.pattern.measures).toHaveLength(1);
		expect(result.pattern.measures[0].slots).toHaveLength(6);
		expect(result.warnings).toEqual([]);
	});

	it("defaults the tempo in silence when none was printed — an absent tempo is not a defect", () => {
		const result = importTab(input({ bpm: 0 }), INDEX);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.pattern.bpm).toBe(80);
		expect(result.warnings).toEqual([]);
	});

	it("carries repeat barlines through", () => {
		const result = importTab(input({ bars: [{ ...AM_BAR, repeatStart: true }, { ...AM_BAR, repeatEnd: true, repeatTimes: 3 }] }), INDEX);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.pattern.measures[0].repeatStart).toBe(true);
		expect(result.pattern.measures[1]).toMatchObject({ repeatEnd: true, repeatTimes: 3 });
	});

	it("refuses rather than repairs a structural misread", () => {
		const result = importTab(input({ timeSignature: "3/4" }), INDEX);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors[0].code).toBe("BAR_OVERFULL");
	});
});

describe("patternToImportBars", () => {
	it("round-trips a pattern through the tool's bars", () => {
		const first = importTab(input({ bars: [{ ...AM_BAR, repeatEnd: true }] }), INDEX);
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		const bars = patternToImportBars(first.pattern);
		expect(bars[0].slots[0]).toEqual({ duration: "eighth", notes: [{ string: 5, fret: 0 }], chord: "Am" });
		expect(bars[0].repeatEnd).toBe(true);
		const second = importTab(input({ bars }), INDEX);
		expect(second.ok).toBe(true);
		if (!second.ok) return;
		expect(second.pattern.measures.map((m) => m.slots.map((s) => s.strings.map((x) => x.fret)))).toEqual(
			first.pattern.measures.map((m) => m.slots.map((s) => s.strings.map((x) => x.fret))),
		);
	});

	it("carries bends, their heights and the bracket flags both ways", () => {
		const bars: ImportBar[] = [
			{
				slots: [
					{ duration: "quarter", notes: [{ string: 3, fret: 7, technique: "bend-full" }] },
					{ duration: "quarter", notes: [{ string: 3, fret: 7, technique: "pre-bend-release", bendTarget: 0.5 }] },
					{ duration: "quarter", notes: [{ string: 5, fret: 0, palmMute: true }] },
					{ duration: "quarter", notes: [{ string: 1, fret: 3, technique: "vibrato", letRing: true }] },
				],
			},
		];
		const first = importTab(input({ bars }), INDEX);
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		const strings = first.pattern.measures[0].slots.map((s) => s.strings);
		expect(strings[0][2]).toMatchObject({ fret: 7, technique: "bend-full" });
		expect(strings[1][2]).toMatchObject({ fret: 7, technique: "pre-bend-release", bendTarget: 0.5 });
		expect(strings[2][4]).toMatchObject({ fret: 0, palmMute: true });
		expect(strings[3][0]).toMatchObject({ fret: 3, technique: "vibrato", letRing: true });
		expect(first.warnings.some((w) => w.code === "UNSUPPORTED_TECHNIQUE")).toBe(false);
		expect(patternToImportBars(first.pattern)).toEqual(bars);
	});

	it("writes every preset as bars the tool takes back", () => {
		for (const preset of PRESET_FINGERPICK_PATTERNS) {
			const bars = patternToImportBars(preset);
			const result = importTab(
				{ name: preset.name, timeSignature: `${preset.timeSignature[0]}/${preset.timeSignature[1]}`, bpm: preset.bpm, bars },
				INDEX,
			);
			expect(result.ok, preset.name).toBe(true);
		}
	});
});
