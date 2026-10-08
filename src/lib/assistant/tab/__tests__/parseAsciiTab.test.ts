import { describe, it, expect } from "vitest";
import { asciiTabProse, looksLikeAsciiTab, parseAsciiTab, splitFretRun } from "@/lib/assistant/tab/parseAsciiTab";
import { patternToAsciiTab } from "@/lib/mcp/asciiTab";
import type { BeatSlot, FingerpickPattern } from "@/lib/fingerpickTypes";
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

	it("maps the techniques the editor can draw, bends included, and the validator keeps them", () => {
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
		const { pattern, warnings } = validateFingerpickPattern(parsed.draft);
		// A bend renders and plays now, so the validator passes it through untouched.
		expect(pattern?.measures[2].slots[0].strings[2].technique).toBe("bend-full");
		expect(warnings.some((w) => w.code === "UNSUPPORTED_TECHNIQUE")).toBe(false);
	});

	it("reads bend heights, releases and pre-bends the way tab writes them, consuming the whole mark", () => {
		const text = [
			"e|--------|--------|",
			"B|--------|--------|",
			"G|7b9-7b8-|7b¼-7b--|",
			"D|--------|--------|",
			"A|--------|--------|",
			"E|--------|--------|",
			"",
			"e|--------|----------------|",
			"B|--------|----------------|",
			"G|7b9r7-7-|7pb9----7pb8r---|",
			"D|--------|----------------|",
			"A|--------|----------------|",
			"E|--------|----------------|",
		].join("\n");
		const parsed = ok(text);
		const g = (m: number) =>
			slotsOf(parsed, m)
				.filter((s) => !s.isRest)
				.map((s) => s.strings[2] as { fret: number | null; technique: string | null; bendTarget?: number });
		expect(g(0)).toEqual([
			{ fret: 7, technique: "bend-full", bendTarget: 2, tied: false, muted: false },
			{ fret: 7, technique: "bend-half", bendTarget: 1, tied: false, muted: false },
		]);
		expect(g(1).map((s) => [s.technique, s.bendTarget])).toEqual([["bend-quarter", 0.5], ["bend-full", 2]]);
		// `7b9r7`: the 7 after the r is where the bend lands, not a second note.
		expect(g(2).map((s) => [s.fret, s.technique, s.bendTarget])).toEqual([[7, "bend-release", 2], [7, null, undefined]]);
		expect(g(3).map((s) => [s.technique, s.bendTarget])).toEqual([["pre-bend", 2], ["pre-bend-release", 1]]);
		expect(parsed.warnings.filter((w) => w.code === "ASCII_UNKNOWN_MARK")).toEqual([]);
	});

	it("keeps every note of a bar whose width does not divide the meter, and still fills the bar", () => {
		// 23 columns: four marked notes whose marks widen the bar unevenly.
		const text = ["e|7b9--7b8r--7pb9r--7b¼--|", ..."BGDAE".split("").map((l) => `${l}|${"-".repeat(23)}|`)].join("\n");
		const parsed = ok(text);
		const slots = slotsOf(parsed);
		expect(slots.filter((s) => !s.isRest).map((s) => s.strings[0].technique)).toEqual(["bend-full", "bend-release", "pre-bend-release", "bend-quarter"]);
		const ticks = { whole: 96, half: 48, "dotted-quarter": 36, quarter: 24, "dotted-eighth": 18, eighth: 12, sixteenth: 6, "32nd": 3 } as Record<string, number>;
		expect(slots.reduce((sum, s) => sum + ticks[s.duration], 0)).toBe(96);
		expect(parsed.warnings.map((w) => w.code)).toEqual(["ASCII_UNEVEN_BAR"]);
		// 40 columns, thirty-six open notes: more than a bar has 32nds, so the tail is dropped and said so.
		const dense = ["e|" + "0".repeat(36) + "----|", ..."BGDAE".split("").map((l) => `${l}|${"-".repeat(40)}|`)].join("\n");
		const packed = ok(dense);
		expect(slotsOf(packed).filter((s) => !s.isRest)).toHaveLength(32);
		expect(packed.warnings.map((w) => w.code)).toContain("ASCII_BAR_OVERFLOW");
	});

	it("reads a bend wider than a whole tone as full, and says so", () => {
		const text = ["e|7b10----|", "B|--------|", "G|--------|", "D|--------|", "A|--------|", "E|--------|"].join("\n");
		const parsed = ok(text);
		expect(slotsOf(parsed)[0].strings[0]).toMatchObject({ fret: 7, technique: "bend-full", bendTarget: 2 });
		expect(parsed.warnings.map((w) => w.code)).toContain("ASCII_BEND_CLAMPED");
	});

	it("reads one tilde as vibrato, two as wide, a long run as a held vibrato", () => {
		const text = ["e|7~--7~~-7~~~~---|", "B|----------------|", "G|----------------|", "D|----------------|", "A|----------------|", "E|----------------|"].join("\n");
		const notes = slotsOf(ok(text)).filter((s) => !s.isRest).map((s) => s.strings[0].technique);
		expect(notes).toEqual(["vibrato", "vibrato-wide", "vibrato"]);
	});

	it("keeps a mark before the note over one after it: 5h7b9 is a hammer-on", () => {
		const text = ["e|5h7b9---|", "B|--------|", "G|--------|", "D|--------|", "A|--------|", "E|--------|"].join("\n");
		const notes = slotsOf(ok(text)).filter((s) => !s.isRest).map((s) => s.strings[0]);
		expect(notes.map((n) => [n.fret, n.technique])).toEqual([[5, null], [7, "hammer-on"]]);
		expect("bendTarget" in notes[1]).toBe(false);
	});

	it("reads P.M. and let-ring lines under a system onto the notes below their runs", () => {
		const text = [
			"e|------------3-3-|",
			"B|----------------|",
			"G|----------------|",
			"D|----------------|",
			"A|0-0-2-2---------|",
			"E|----------------|",
			"  P.M.        let ring",
			"",
			"e|--------|",
			"B|--------|",
			"G|--------|",
			"D|--------|",
			"A|3-------|",
			"E|--------|",
		].join("\n");
		const parsed = ok(text);
		// The bracket line is neither a seventh tab line nor prose: both systems still read.
		expect(parsed.draft.measures).toHaveLength(2);
		expect(asciiTabProse(text)).toBe("");
		const a = slotsOf(parsed)
			.filter((s) => !s.isRest)
			.map((s) => (s.strings[4].fret !== null ? s.strings[4] : s.strings[0]) as { fret: number | null; palmMute?: boolean; letRing?: boolean });
		expect(a.map((n) => [n.fret, n.palmMute === true, n.letRing === true])).toEqual([
			[0, true, false],
			[0, true, false],
			[2, false, false],
			[2, false, false],
			[3, false, true],
			[3, false, true],
		]);
	});

	it("round-trips every mark the preview writes", () => {
		const silent = (): BeatSlot["strings"][number] => ({ fret: null, technique: null, tied: false, muted: false });
		let id = 0;
		const slot = (notes: Record<number, Partial<BeatSlot["strings"][number]>>, duration: BeatSlot["duration"] = "quarter"): BeatSlot => {
			const strings = [silent(), silent(), silent(), silent(), silent(), silent()] as BeatSlot["strings"];
			for (const [i, n] of Object.entries(notes)) strings[Number(i)] = { ...silent(), ...n };
			return { id: `s${id++}`, duration, strings };
		};
		const pattern: FingerpickPattern = {
			id: "p",
			name: "Marks",
			bpm: 80,
			timeSignature: [4, 4],
			measures: [
				{ id: "m1", slots: [
					slot({ 2: { fret: 7, technique: "bend-full", bendTarget: 2 } }),
					slot({ 2: { fret: 7, technique: "bend-release", bendTarget: 1 } }),
					slot({ 2: { fret: 7, technique: "pre-bend-release", bendTarget: 2 } }),
					slot({ 2: { fret: 7, technique: "bend-quarter", bendTarget: 0.5 } }),
				] },
				{ id: "m2", slots: [
					slot({ 4: { fret: 0, palmMute: true } }),
					slot({ 4: { fret: 0, palmMute: true } }),
					slot({ 0: { fret: 3, technique: "vibrato-wide", letRing: true } }),
					slot({ 0: { fret: 3, technique: "vibrato", letRing: true } }),
				] },
			],
		};
		const parsed = ok(patternToAsciiTab(pattern));
		const marks = (m: number, string: number) =>
			slotsOf(parsed, m)
				.filter((s) => !s.isRest)
				.map((s) => {
					const n = s.strings[string] as { fret: number | null; technique: string | null; bendTarget?: number; palmMute?: boolean; letRing?: boolean };
					return [n.fret, n.technique, n.bendTarget ?? null, n.palmMute === true, n.letRing === true];
				});
		expect(marks(0, 2)).toEqual([
			[7, "bend-full", 2, false, false],
			[7, "bend-release", 1, false, false],
			[7, "pre-bend-release", 2, false, false],
			[7, "bend-quarter", 0.5, false, false],
		]);
		expect(marks(1, 4).slice(0, 2)).toEqual([[0, null, null, true, false], [0, null, null, true, false]]);
		expect(marks(1, 0).slice(2)).toEqual([[3, "vibrato-wide", null, false, true], [3, "vibrato", null, false, true]]);
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

describe("splitFretRun", () => {
	const frets = (run: string) => splitFretRun(run).map((p) => p.fret);
	const offsets = (run: string) => splitFretRun(run).map((p) => p.offset);

	it("reads a single fret as itself", () => {
		expect(frets("0")).toEqual([0]);
		expect(frets("7")).toEqual([7]);
		expect(frets("12")).toEqual([12]);
		expect(frets("24")).toEqual([24]);
	});

	it("splits a run that would be a fret no neck has", () => {
		expect(frets("57")).toEqual([5, 7]);
		expect(frets("1215")).toEqual([12, 15]);
		expect(frets("579")).toEqual([5, 7, 9]);
	});

	it("never lets a leading zero swallow the note after it", () => {
		expect(frets("03")).toEqual([0, 3]);
		expect(frets("00")).toEqual([0, 0]);
	});

	it("says where in the run each fret started", () => {
		expect(offsets("1215")).toEqual([0, 2]);
		expect(offsets("57")).toEqual([0, 1]);
		expect(offsets("03")).toEqual([0, 1]);
	});
});

describe("parseAsciiTab — frets written with nothing between them", () => {
	const system = (line: string) =>
		["e|--------|", "B|--------|", "G|--------|", "D|--------|", `A|${line}|`, "E|--------|"].join("\n");

	it("reads a high position as the two notes it is, not one impossible fret", () => {
		const parsed = parseAsciiTab(system("1215----"));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const slots = (parsed.draft.measures![0] as { slots: { strings: { fret: number | null }[] }[] }).slots;
		expect(slots[0].strings[4].fret).toBe(12);
		expect(slots[1].strings[4].fret).toBe(15);
	});

	it("keeps two low frets apart rather than reading a plausible wrong one", () => {
		const parsed = parseAsciiTab(system("03------"));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const slots = (parsed.draft.measures![0] as { slots: { strings: { fret: number | null }[] }[] }).slots;
		expect(slots[0].strings[4].fret).toBe(0);
		expect(slots[1].strings[4].fret).toBe(3);
	});

	it("says it had to make the call", () => {
		const parsed = parseAsciiTab(system("1215----"));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const split = parsed.warnings.find((w) => w.code === "ASCII_FRET_RUN_SPLIT");
		expect(split?.message).toContain("12, 15");
	});

	it("says nothing when a run is one ordinary fret", () => {
		const parsed = parseAsciiTab(system("12------"));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.warnings.some((w) => w.code === "ASCII_FRET_RUN_SPLIT")).toBe(false);
	});
});
