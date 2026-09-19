import { describe, it, expect } from "vitest";
import { readStringFret } from "@/lib/assistant/tab/parseStringFret";
import { readTabSentence } from "@/lib/assistant/tab/readTabSentence";
import { routeTabInput } from "@/lib/assistant/tab/router";
import { buildTabProposal } from "@/lib/assistant/tab/buildTabProposal";
import { resolveTabTurn } from "@/lib/assistant/tab/turn";
import { INDEX, voicingFor } from "./fixtures";

const groups = (text: string) => {
	const r = readStringFret(text);
	if (!r.found || !r.ok) throw new Error(r.found ? r.error : "not found");
	return r.groups.map((g) => g.map((n) => `${n.stringIndex + 1}:${n.fret}`));
};
const notes = (text: string) => groups(text).flat();

describe("readStringFret", () => {
	it("pairs string numbers with frets in order", () => {
		expect(notes("string:66544322, fret:8-11-10-8-10-8-8-11")).toEqual([
			"6:8", "6:11", "5:10", "4:8", "4:10", "3:8", "2:8", "2:11",
		]);
	});

	it("takes either order, plural words, Chinese words and other separators", () => {
		expect(notes("frets: 0 2 2, strings: 5 4 3")).toEqual(["5:0", "4:2", "3:2"]);
		expect(notes("弦：6 5 4 品：3,2,0")).toEqual(["6:3", "5:2", "4:0"]);
		expect(notes("string 6-5-4 fret 3-2-0")).toEqual(["6:3", "5:2", "4:0"]);
	});

	it("reads single-digit frets run together, two-digit ones in parentheses", () => {
		expect(notes("string:6654 fret:5768")).toEqual(["6:5", "6:7", "5:6", "4:8"]);
		expect(notes("string:665432 fret:5768(11)(12)")).toEqual(["6:5", "6:7", "5:6", "4:8", "3:11", "2:12"]);
		expect(notes("string:665432 fret:5768（11）（12）")).toEqual(["6:5", "6:7", "5:6", "4:8", "3:11", "2:12"]);
		expect(notes("string:6654 fret:5x7(10)")).toEqual(["6:5", "6:x", "5:7", "4:10"]);
		// A bare two-digit group is one fret when it can be, two when it cannot.
		expect(notes("string:6 fret:11")).toEqual(["6:11"]);
		expect(notes("string:66 fret:57")).toEqual(["6:5", "6:7"]);
		expect(notes("string:6654 fret:8 11 10 8")).toEqual(["6:8", "6:11", "5:10", "4:8"]);
	});

	it("reads x as a dead note", () => {
		expect(notes("string:654 fret:3-x-0")).toEqual(["6:3", "5:x", "4:0"]);
	});

	it("blanks both lists from the text it hands back", () => {
		const r = readStringFret("string:66544322, fret:8-11-10-8-10-8-8-11 in 3/4");
		expect(r.found && r.ok && r.text.replace(/\s+/g, " ").trim()).toBe(", in 3/4");
	});

	it("reads several pairs as several bars, in the order written", () => {
		expect(groups("string:6654, fret:8-11-10-8\nstring:3211, fret:8-8-11-8\nfret:3 string:6")).toEqual([
			["6:8", "6:11", "5:10", "4:8"],
			["3:8", "2:8", "1:11", "1:8"],
			["6:3"],
		]);
	});

	it("says what is wrong when the lists do not pair up, and in which bar", () => {
		const short = readStringFret("string:665 fret:8-11");
		expect(short.found && !short.ok && short.error).toMatch(/Bar 1 has 3 string numbers but 2 frets/);
		const half = readStringFret("string:665");
		expect(half.found && !half.ok && half.error).toMatch(/no frets/);
		const second = readStringFret("string:66 fret:8-11, string:5 fret:1-2");
		expect(second.found && !second.ok && second.error).toMatch(/^Bar 2/);
		const odd = readStringFret("string:66 fret:8-11, string:5");
		expect(odd.found && !odd.ok && odd.error).toMatch(/^Bar 2 has strings but no frets/);
		const high = readStringFret("string:6 fret:(30)");
		expect(high.found && !high.ok && high.error).toMatch(/past the neck/);
	});

	it("is absent from a sentence without the words", () => {
		expect(readStringFret("Am: 5 3 2 1").found).toBe(false);
	});
});

describe("notes written out, through the readers", () => {
	it("is read whole, and not as a pick order", () => {
		const r = readTabSentence("string:66544322, fret:8-11-10-8-10-8-8-11", INDEX);
		expect(r.notes).toEqual([expect.any(Array)]);
		expect(r.notes?.[0]).toHaveLength(8);
		expect(r.order).toBeNull();
		expect(r.leftover).toBe("");
		expect(routeTabInput("string:66544322, fret:8-11-10-8-10-8-8-11", INDEX).path).toBe("notes");
	});

	it("takes the note value, meter and a name alongside", () => {
		const r = readTabSentence("string:6654 fret:8-11-10-8 /16 in 3/4, name it lick", INDEX);
		expect(r.notes?.[0]).toHaveLength(4);
		expect(r.duration).toBe("sixteenth");
		expect(r.timeSignature).toEqual([3, 4]);
		expect(r.name).toBe("lick");
		expect(r.leftover).toBe("");
	});

	it("writes the frets as given, one note per slot, filling the bar", () => {
		const r = readTabSentence("string:66544322, fret:8-11-10-8-10-8-8-11", INDEX);
		const built = buildTabProposal({ chordWords: [], notes: r.notes, voicingFor });
		if (!built.ok) throw new Error(built.error);
		const slots = built.proposal.pattern.measures[0].slots;
		expect(built.proposal.pattern.measures).toHaveLength(1);
		expect(slots).toHaveLength(8);
		expect(slots.map((s) => s.duration)).toEqual(Array(8).fill("eighth"));
		expect(slots[0].strings[5].fret).toBe(8);
		expect(slots[1].strings[5].fret).toBe(11);
		expect(slots[2].strings[4].fret).toBe(10);
		expect(slots[7].strings[1].fret).toBe(11);
		expect(built.proposal.warnings).toEqual([]);
		expect(built.proposal.name).toBe("Written tab");
	});

	it("writes one bar per pair, padding a short one and splitting a long one", () => {
		const r = readTabSentence(
			"string:6654, fret:8-11-10-8\nstring:66544322, fret:8-11-10-8-10-8-8-11\nstring:665443221, fret:8-11-10-8-10-8-8-11-8",
			INDEX,
		);
		const built = buildTabProposal({ chordWords: [], notes: r.notes, voicingFor });
		if (!built.ok) throw new Error(built.error);
		const { measures } = built.proposal.pattern;
		// A short pair is padded, not repeated; a long one spills into a bar of its own.
		expect(measures).toHaveLength(4);
		expect(measures[0].slots.filter((s) => !s.isRest)).toHaveLength(4);
		expect(measures[0].slots.filter((s) => s.isRest).length).toBeGreaterThan(0);
		expect(measures[1].slots.filter((s) => !s.isRest)).toHaveLength(8);
		expect(measures[2].slots.filter((s) => !s.isRest)).toHaveLength(8);
		expect(measures[3].slots.filter((s) => !s.isRest)).toHaveLength(1);
		expect(measures[3].slots[0].strings[0].fret).toBe(8);
		expect(built.proposal.warnings.map((w) => w.code)).toEqual(["PADDED"]);
	});

	it("marks a chord on the bar without changing the written frets", () => {
		const r = readTabSentence("Am string:654 fret:x-0-2", INDEX);
		const built = buildTabProposal({ chordWords: r.chordWords, notes: r.notes, voicingFor });
		if (!built.ok) throw new Error(built.error);
		const slots = built.proposal.pattern.measures[0].slots;
		expect(slots[0].chord).toEqual({ root: "A", suffix: "minor", voicingId: null });
		expect(slots[0].strings[5].muted).toBe(true);
		expect(slots[2].strings[3].fret).toBe(2);
	});

	it("answers a mismatch by saying what was wrong", async () => {
		const out = await resolveTabTurn({ text: "string:665 fret:8-11", index: INDEX, voicings: async () => voicingFor });
		expect(out.proposal).toBeUndefined();
		expect(out.text).toMatch(/Bar 1 has 3 string numbers but 2 frets/);
		expect(out.templates?.[0]).toMatch(/^string:/);
	});

	it("answers written notes with a proposal", async () => {
		const out = await resolveTabTurn({ text: "string:66544322, fret:8-11-10-8-10-8-8-11", index: INDEX, voicings: async () => voicingFor });
		expect(out.proposal?.pattern.measures[0].slots).toHaveLength(8);
		expect(out.text).toMatch(/as you wrote them/);
	});
});
