import { describe, it, expect } from "vitest";
import { asciiTabProse, looksLikeAsciiTab, parseAsciiTab } from "@/lib/tabAssistant/parseAsciiTab";
import { validateFingerpickPattern } from "@/lib/tabImport";
import type { Duration } from "@/lib/fingerpickTypes";

const C_ARPEGGIO = [
	"e|------0-------0-|",
	"B|----1-------1---|",
	"G|--0-------0-----|",
	"D|----------------|",
	"A|3-------3-------|",
	"E|----------------|",
].join("\n");

const ok = (text: string, ts?: [number, number]) => {
	const parsed = parseAsciiTab(text, ts ? { timeSignature: ts } : {});
	if (!parsed.ok) throw new Error(parsed.error);
	return parsed;
};
type Slot = { duration: Duration; isRest?: boolean; strings: { fret: number | null; muted: boolean; technique: string | null }[] };
const slotsOf = (parsed: ReturnType<typeof ok>, m = 0) =>
	(parsed.draft.measures![m] as { slots: Slot[] }).slots;
const sounded = (slots: Slot[]) =>
	slots.map((slot) =>
		slot.isRest
			? `rest/${slot.duration}`
			: slot.strings
					.map((s, i) => (s.muted ? `${i + 1}:x` : s.fret === null ? null : `${i + 1}:${s.fret}`))
					.filter((s): s is string => s !== null)
					.join(" ") + `/${slot.duration}`,
	);

describe("parseAsciiTab", () => {
	it("recognises six labelled lines, and nothing shorter", () => {
		expect(looksLikeAsciiTab(C_ARPEGGIO)).toBe(true);
		expect(looksLikeAsciiTab(C_ARPEGGIO.split("\n").slice(0, 5).join("\n"))).toBe(false);
		expect(looksLikeAsciiTab("Am: 5 3 2 1")).toBe(false);
	});

	it("reads frets by string and rhythm by spacing: a note every two of 16 columns is an eighth", () => {
		const parsed = ok(C_ARPEGGIO);
		expect(parsed.draft.measures).toHaveLength(1);
		expect(sounded(slotsOf(parsed))).toEqual([
			"5:3/eighth",
			"3:0/eighth",
			"2:1/eighth",
			"1:0/eighth",
			"5:3/eighth",
			"3:0/eighth",
			"2:1/eighth",
			"1:0/eighth",
		]);
		expect(parsed.warnings).toEqual([]);
	});

	it("passes the validator as it is", () => {
		const { pattern, errors } = validateFingerpickPattern(ok(C_ARPEGGIO).draft);
		expect(errors).toEqual([]);
		expect(pattern?.measures[0].slots).toHaveLength(8);
	});

	it("reads without labels, and with several bars", () => {
		const two = ["|--0-----|--3-----|", "|--------|--------|", "|--------|--------|", "|--------|--------|", "|--------|--------|", "|--------|--------|"].join("\n");
		const parsed = ok(two);
		expect(parsed.draft.measures).toHaveLength(2);
		// Two columns of eight before the note: a quarter rest; six after it: a
		// half, then a quarter rest.
		expect(sounded(slotsOf(parsed, 0))).toEqual(["rest/quarter", "1:0/half", "rest/quarter"]);
		expect(sounded(slotsOf(parsed, 1))[1]).toBe("1:3/half");
	});

	it("reads multi-digit frets and a second system", () => {
		const text = [
			"e|--12--|",
			"B|------|",
			"G|------|",
			"D|------|",
			"A|------|",
			"E|------|",
			"",
			"e|------|",
			"B|--10--|",
			"G|------|",
			"D|------|",
			"A|------|",
			"E|------|",
		].join("\n");
		const parsed = ok(text);
		expect(parsed.draft.measures).toHaveLength(2);
		expect(sounded(slotsOf(parsed, 0)).find((s) => s.startsWith("1:12/"))).toBeDefined();
		expect(sounded(slotsOf(parsed, 1)).find((s) => s.startsWith("2:10/"))).toBeDefined();
		// Six columns do not divide a 4/4 bar: the rhythm was guessed.
		expect(parsed.warnings.map((w) => w.code)).toEqual(["ASCII_UNEVEN_BAR", "ASCII_UNEVEN_BAR"]);
	});

	it("maps the techniques the editor can draw, and reports the rest through the validator", () => {
		const text = [
			"e|5h7-7p5-|5/7-7\\5-|--------|",
			"B|--------|--------|--------|",
			"G|--------|--------|7b------|",
			"D|--------|--------|--------|",
			"A|x-------|--------|--------|",
			"E|--------|--------|--------|",
		].join("\n");
		const parsed = ok(text);
		const onE = (m: number) => slotsOf(parsed, m).filter((s) => !s.isRest).map((s) => s.strings[0].technique);
		expect(onE(0)).toEqual([null, "hammer-on", null, "pull-off"]);
		expect(onE(1)).toEqual([null, "slide-up", null, "slide-down"]);
		expect(slotsOf(parsed, 2)[0].strings[2].technique).toBe("bend-full");
		expect(slotsOf(parsed, 0)[0].strings[4].muted).toBe(true);
		const { warnings } = validateFingerpickPattern(parsed.draft);
		expect(warnings.some((w) => w.code === "UNSUPPORTED_TECHNIQUE" && w.original === "bend-full")).toBe(true);
	});

	it("takes the meter it is given", () => {
		const text = ["e|--0--0--0--0|", "B|------------|", "G|------------|", "D|------------|", "A|------------|", "E|------------|"].join("\n");
		const parsed = ok(text, [3, 4]);
		expect(parsed.draft.timeSignature).toEqual([3, 4]);
		expect(slotsOf(parsed).filter((s) => !s.isRest)).toHaveLength(4);
		expect(parsed.warnings).toEqual([]);
	});

	it("reads a system written low string first when the labels say so", () => {
		const text = ["E|3-------|", "A|--------|", "D|--------|", "G|--------|", "B|--------|", "e|------0-|"].join("\n");
		const parsed = ok(text);
		const first = sounded(slotsOf(parsed));
		expect(first[0]).toBe("6:3/half");
		expect(first[first.length - 1]).toBe("1:0/quarter");
	});

	it("flags marks it does not know", () => {
		const text = ["e|--0~---|", "B|--?----|", "G|-------|", "D|-------|", "A|-------|", "E|-------|"].join("\n");
		const parsed = ok(text);
		expect(parsed.warnings.some((w) => w.code === "ASCII_UNKNOWN_MARK" && w.original === "?")).toBe(true);
	});

	it("separates the prose around a tab from the tab", () => {
		expect(asciiTabProse(`Blackbird intro, 3/4\n${C_ARPEGGIO}\n`)).toBe("Blackbird intro, 3/4");
	});

	it("refuses text that is not a tab", () => {
		expect(parseAsciiTab("Am: 5 3 2 1").ok).toBe(false);
	});
});
