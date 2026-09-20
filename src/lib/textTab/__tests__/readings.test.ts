import { describe, expect, it } from "vitest";
import { readTextTab, looksLikeTextTab, textTabProse } from "@/lib/textTab/columns";
import { evenReading, spacingReading, swingReading, textTabReadings } from "@/lib/textTab/readings";
import { byEarWarning, textTabCandidates } from "@/lib/textTab/candidates";
import { tripletGroups } from "@/lib/fingerpickEdit";
import type { Duration } from "@/lib/fingerpickTypes";

// A C arpeggio typed a note every two of sixteen columns — the spacing reads as eighths.
const C_ARPEGGIO = [
	"e|------0-------0-|",
	"B|----1-------1---|",
	"G|--0-------0-----|",
	"D|----------------|",
	"A|3-------3-------|",
	"E|----------------|",
].join("\n");

// Six notes typed close together, then a bar of two chords: nothing here says what lasts how long.
const TIGHT = [
	"e|-0-1-3-|-3--0--|",
	"B|-------|-0--1--|",
	"G|-------|-0--0--|",
	"D|-------|-------|",
	"A|-------|-------|",
	"E|-0-0-0-|-3--3--|",
].join("\n");

type Slot = { duration: Duration; isRest?: boolean; strings: { fret: number | null; tied: boolean }[] };
const measuresOf = (draft: { measures?: unknown[] }) => draft.measures as { slots: Slot[] }[];
const rhythm = (slots: Slot[]) => slots.map((s) => `${s.isRest ? "r" : ""}${s.duration}`);
const frets = (slot: Slot) =>
	slot.strings
		.map((s, i) => (s.fret === null ? null : `${i + 1}:${s.fret}${s.tied ? "~" : ""}`))
		.filter((s): s is string => s !== null)
		.join(" ");

const columns = (text: string) => {
	const read = readTextTab(text);
	if (!read) throw new Error("not a tab");
	return read;
};

describe("readTextTab", () => {
	it("reads bars and columns, with the notes stacked in the column they start in", () => {
		const read = columns(TIGHT);
		expect(read.bars.map((b) => b.width)).toEqual([7, 7]);
		expect(read.bars[0].columns.map((c) => c.at)).toEqual([1, 3, 5]);
		expect(read.bars[0].columns[0].notes.map((n) => `${n.stringIndex}:${n.fret}`)).toEqual(["0:0", "5:0"]);
		expect(read.bars[1].columns.map((c) => c.notes.length)).toEqual([4, 4]);
		expect(read.unknownMarks).toEqual([]);
	});

	it("is the reader the assistant's router already used", () => {
		expect(looksLikeTextTab(C_ARPEGGIO)).toBe(true);
		expect(looksLikeTextTab("Am: 5 3 2 1")).toBe(false);
		expect(textTabProse(`Travis in C\n${C_ARPEGGIO}`)).toBe("Travis in C");
	});
});

describe("the readings", () => {
	it("by spacing: a note every two of sixteen columns is an eighth", () => {
		const reading = spacingReading(columns(C_ARPEGGIO), [4, 4]);
		expect(rhythm(measuresOf(reading.draft)[0].slots)).toEqual(Array(8).fill("eighth"));
		expect(reading.warnings).toEqual([]);
	});

	it("straight eighths: every column an eighth, a short bar filled with rests, and says so", () => {
		const reading = evenReading(columns(TIGHT), [4, 4], "eighth");
		const [first, second] = measuresOf(reading.draft);
		expect(rhythm(first.slots)).toEqual(["eighth", "eighth", "eighth", "rhalf", "reighth"]);
		expect(rhythm(second.slots)).toEqual(["eighth", "eighth", "rhalf", "rquarter"]);
		expect(reading.warnings.map((w) => w.code)).toEqual(["TEXT_TAB_BAR_PADDED"]);
		expect(reading.warnings[0].message).toMatch(/^Bars 1, 2 had fewer notes/);
	});

	it("sixteenths: a bar with more notes than fit runs on into the next, and says so", () => {
		const twenty = [
			"e|" + "0--".repeat(20) + "|",
			"B|" + "---".repeat(20) + "|",
			"G|" + "---".repeat(20) + "|",
			"D|" + "---".repeat(20) + "|",
			"A|" + "---".repeat(20) + "|",
			"E|" + "---".repeat(20) + "|",
		].join("\n");
		const reading = evenReading(columns(twenty), [4, 4], "sixteenth");
		const measures = measuresOf(reading.draft);
		expect(measures.length).toBe(2);
		expect(measures[0].slots.every((s) => s.duration === "sixteenth" && !s.isRest)).toBe(true);
		expect(rhythm(measures[1].slots)).toEqual([...Array(4).fill("sixteenth"), "rhalf", "rquarter"]);
		expect(reading.warnings.map((w) => w.code)).toEqual(["TEXT_TAB_BAR_PADDED", "TEXT_TAB_BAR_SPLIT"]);
	});

	it("swing: pairs become a struck, a tied and a struck triplet eighth — one beat the editor groups as a triplet", () => {
		const reading = swingReading(columns(TIGHT), [4, 4]);
		if (reading === null) throw new Error("swing is offered in 4/4");
		const [first, second] = measuresOf(reading.draft);
		// Three columns: a pair, then a lone column that gets the whole beat.
		expect(rhythm(first.slots)).toEqual([
			"eighth-triplet",
			"eighth-triplet",
			"eighth-triplet",
			"quarter",
			"rhalf",
		]);
		expect(frets(first.slots[0])).toBe("1:0 6:0");
		expect(frets(first.slots[1])).toBe("1:0~ 6:0~");
		expect(frets(first.slots[2])).toBe("1:1 6:0");
		const result = textTabCandidates(TIGHT);
		if (!result.ok) throw new Error(result.error);
		const validated = result.candidates.find((c) => c.id === "swing");
		if (!validated) throw new Error("no swing candidate");
		expect(tripletGroups(validated.pattern.measures[0].slots)).toEqual([{ start: 0, duration: "eighth-triplet" }]);
		expect(rhythm(second.slots)).toEqual(["eighth-triplet", "eighth-triplet", "eighth-triplet", "rhalf", "rquarter"]);
	});

	it("swing is not offered in a compound meter, whose eighths are already in threes", () => {
		expect(swingReading(columns(TIGHT), [6, 8])).toBeNull();
		expect(textTabReadings(columns(TIGHT), [6, 8]).map((r) => r.id)).not.toContain("swing");
	});

	it("offers each distinct reading once: spacing that reads as eighths is not listed twice", () => {
		const ids = textTabReadings(columns(C_ARPEGGIO), [4, 4]).map((r) => r.id);
		expect(ids).toEqual(["eighths", "sixteenths", "swing"]);
		expect(textTabReadings(columns(TIGHT), [4, 4]).map((r) => r.id)).toEqual([
			"eighths",
			"sixteenths",
			"spacing",
			"swing",
		]);
	});

	it("carries an unknown mark's warning on every reading", () => {
		const odd = TIGHT.replace("-0-1-3-", "-0*1-3-");
		for (const reading of textTabReadings(columns(odd), [4, 4])) {
			expect(reading.warnings.some((w) => w.code === "ASCII_UNKNOWN_MARK" && w.original === "*")).toBe(true);
		}
	});
});

describe("textTabCandidates", () => {
	it("validates every reading into a named pattern at the asked tempo", () => {
		const result = textTabCandidates(TIGHT, { timeSignature: [4, 4], bpm: 72, name: "  Page 12  " });
		if (!result.ok) throw new Error(result.error);
		expect(result.candidates.map((c) => c.id)).toEqual(["eighths", "sixteenths", "spacing", "swing"]);
		for (const c of result.candidates) {
			expect(c.pattern.name).toBe("Page 12");
			expect(c.pattern.bpm).toBe(72);
			expect(c.pattern.timeSignature).toEqual([4, 4]);
			expect(c.pattern.measures.length).toBeGreaterThanOrEqual(2);
			expect(c.label).not.toBe("");
			expect(c.description).not.toBe("");
		}
		expect(byEarWarning(result.candidates[0])).toMatchObject({
			code: "RHYTHM_BY_EAR",
			message: expect.stringContaining("straight eighths"),
		});
	});

	it("refuses what is not six lines of tab", () => {
		expect(textTabCandidates("C - G - Am - F")).toEqual({
			ok: false,
			error: "Six lines of tab are needed, one per string.",
		});
	});
});
