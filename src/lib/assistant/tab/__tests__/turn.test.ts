import { describe, it, expect } from "vitest";
import { resolveTabTurn } from "@/lib/assistant/tab/turn";
import { suggestTab } from "@/lib/assistant/tab/suggest";
import { readTabSentence } from "@/lib/assistant/tab/readTabSentence";
import { BLANK } from "@/lib/assistant/blank";
import { READER_CHOICE_CODES } from "@/lib/assistant/__evals__/tabCases";
import { INDEX, voicingFor } from "./fixtures";

const resolve = (text: string, uiLang: "en" | "zh" = "en") =>
	resolveTabTurn({ text, index: INDEX, uiLang, voicings: async () => voicingFor });

const TAB = [
	"e|------0-------0-|",
	"B|----1-------1---|",
	"G|--0-------0-----|",
	"D|----------------|",
	"A|3-------3-------|",
	"E|----------------|",
].join("\n");

describe("resolveTabTurn", () => {
	it("reports the choices it made for a sentence that left them out, and nothing worse", async () => {
		// The eval case tab-vague-meter. Nothing here names a picking order, so
		// the reader picks one and says so; the card is sound (#303).
		const outcome = await resolve("something in 3/4 for fingerpicking, in G");
		const codes = (outcome.proposal?.warnings ?? []).map((w) => w.code);
		expect(codes).toContain("ORDER_GUESSED");
		expect(codes.filter((c) => !READER_CHOICE_CODES.includes(c))).toEqual([]);
	});

	it("answers a question about one chord with its shapes, not a pattern", async () => {
		const outcome = await resolve("show me Am");
		expect(outcome.chords).toMatchObject([{ root: "A", suffix: "minor" }]);
		expect(outcome.proposal).toBeUndefined();
		expect(outcome.templates).toBeUndefined();
	});

	it("answers a chord and an order with a proposal, in the player's language", async () => {
		const en = await resolve("Am: 5 3 2 1 3 2 1 3");
		expect(en.proposal?.pattern.measures).toHaveLength(1);
		expect(en.proposal?.chords).toEqual([{ root: "A", suffix: "minor", voicingId: null }]);
		expect(en.lang).toBe("en");
		expect(en.templates).toBeUndefined();
		const zh = await resolve("Am 5 3 2 1 三拍子");
		expect(zh.lang).toBe("zh");
		expect(zh.proposal?.pattern.timeSignature).toEqual([3, 4]);
		expect(zh.text).toMatch(/[一-鿿]/);
	});

	it("answers a style word with the preset's bar over the chord", async () => {
		const out = await resolve("travis picking in C");
		expect(out.proposal?.name).toBe("Travis in C");
		expect(out.proposal?.pattern.bpm).toBe(100);
		expect(out.text).toMatch(/shipped pattern/);
	});

	it("answers a bare chord line with a default order, and says it is a guess", async () => {
		const out = await resolve("C G Am F");
		expect(out.proposal?.pattern.measures).toHaveLength(4);
		expect(out.proposal?.warnings.map((w) => w.code)).toContain("ORDER_GUESSED");
		expect(out.text).toMatch(/suggestion/);
		// The usual orders, over the same chords, to take instead of the guess.
		expect(out.templates).toEqual(["C G Am F: 53231323", "C G Am F: R3231323", "C G Am F: R323", "C G Am F: R3(12)3"]);
		expect(out.seen).toBeUndefined();
		expect(out.text).not.toMatch(/[\u4e00-\u9fff]/);
		// The same offer in Chinese writes the root the Chinese way.
		const zh = await resolve("C G Am F 的分解", "zh");
		expect(zh.templates).toEqual(["C G Am F: 53231323", "C G Am F: 根3231323", "C G Am F: 根323", "C G Am F: 根3(12)3"]);
	});

	it("reads a lowercase chord and root, as a phone keyboard writes them", async () => {
		const out = await resolve("c: r3231323");
		expect(out.proposal?.chords).toEqual([{ root: "C", suffix: "major", voicingId: null }]);
		expect(out.proposal?.warnings).toEqual([]);
		expect(out.templates).toBeUndefined();
	});

	it("reads a root order over chords and puts the thumb on each root", async () => {
		const out = await resolve("C G Am: 根3231323");
		expect(out.proposal?.warnings).toEqual([]);
		expect(out.templates).toBeUndefined();
		const bass = out.proposal?.pattern.measures.map((m) => m.slots[0].strings.findIndex((s) => s.fret !== null) + 1);
		expect(bass).toEqual([5, 6, 5]);
	});

	it("answers a pasted tab through the import validator", async () => {
		const out = await resolve(`name it blackbird\n${TAB}`);
		expect(out.proposal?.name).toBe("blackbird");
		expect(out.proposal?.pattern.measures[0].slots).toHaveLength(8);
		expect(out.proposal?.chords).toEqual([]);
		expect(out.text).toMatch(/spacing/);
		const unnamed = await resolve(TAB);
		expect(unnamed.proposal?.name).toBe("Pasted tab");
	});

	it("answers small talk before reading anything as a request", async () => {
		const out = await resolve("thanks");
		expect(out.proposal).toBeUndefined();
		expect(out.text).not.toBe("");
	});

	it("offers sentences that would have worked when nothing read the message", async () => {
		const out = await resolve("something gentle in Am for a rainy day");
		expect(out.proposal).toBeUndefined();
		expect(out.templates).toContain("Am: 53231323");
		expect(out.templates).toContain("Am: R3231323");
		expect(out.text).not.toMatch(/[\u4e00-\u9fff]/);
		expect(out.templates).toContain("travis picking in Am");
		expect(out.text).toMatch(/Am/);
		expect(out.seen).toBeDefined();
	});
});

describe("suggestTab", () => {
	it("leaves blanks where nothing was read", () => {
		const g = suggestTab(readTabSentence("hello there", INDEX), "en");
		expect(g.templates[0]).toBe(`${BLANK}: 53231323`);
		expect(g.templates).toContain("C G Am F");
	});

	it("fills in what was read, in Chinese too", () => {
		const g = suggestTab(readTabSentence("给我 Em 温柔一点的", INDEX), "zh");
		expect(g.templates).toContain("Em 三指法");
		expect(g.text).toMatch(/Em/);
	});
});
