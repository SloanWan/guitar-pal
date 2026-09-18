import { describe, it, expect } from "vitest";
import { correctKeywords, editDistance } from "@/lib/strumAssistant/fuzzy";
import { readTabSentence } from "@/lib/tabAssistant/readTabSentence";
import { routeTabInput } from "@/lib/tabAssistant/router";
import { resolveTabTurn } from "@/lib/tabAssistant/turn";
import { INDEX, voicingFor } from "@/lib/tabAssistant/__tests__/fixtures";

const LEXICON = [
	{ word: "string", beforeDigits: true },
	{ word: "fret", beforeDigits: true },
	{ word: "travis" },
	{ word: "arpeggio" },
	{ word: "waltz" },
	{ word: "三指法" },
];

describe("editDistance", () => {
	it("counts substitutions, insertions, deletions and a swap as one each", () => {
		expect(editDistance("string", "string")).toBe(0);
		expect(editDistance("strng", "string")).toBe(1);
		expect(editDistance("fert", "fret")).toBe(1);
		expect(editDistance("arpegio", "arpeggio")).toBe(1);
		expect(editDistance("strum", "string")).toBe(3);
	});
});

describe("correctKeywords", () => {
	it("takes a near miss as the word it is nearest to, and says so", () => {
		const { text, corrections } = correctKeywords("travs pickng in Am", LEXICON);
		expect(text).toBe("travis pickng in Am");
		expect(corrections).toEqual([{ from: "travs", to: "travis" }]);
	});

	it("allows two characters wrong in a long word, one in a short one", () => {
		expect(correctKeywords("arpegio", LEXICON).text).toBe("arpeggio");
		expect(correctKeywords("arpeggoi", LEXICON).text).toBe("arpeggio");
		expect(correctKeywords("waltx", LEXICON).text).toBe("waltz");
		expect(correctKeywords("wlazt", LEXICON).text).toBe("wlazt");
		// Four letters is too close to too many words to guess at.
		expect(correctKeywords("walz", LEXICON).text).toBe("walz");
		expect(correctKeywords("show me a slow one", [{ word: "slow" }, { word: "waltz" }]).text).toBe("show me a slow one");
	});

	it("corrects a clause keyword only when digits follow it", () => {
		expect(correctKeywords("strng:6654 fert: 8-11-10-8", LEXICON).text).toBe("string:6654 fret: 8-11-10-8");
		expect(correctKeywords("a strong feeling", LEXICON).text).toBe("a strong feeling");
		expect(correctKeywords("free 8", LEXICON).text).toBe("fret 8");
	});

	it("never corrects a chord name", () => {
		expect(correctKeywords("Fmaj7 waltz", LEXICON).text).toBe("Fmaj7 waltz");
		expect(correctKeywords("Am7 travs", LEXICON).text).toBe("Am7 travis");
	});

	it("corrects a Chinese word one character off", () => {
		const { text, corrections } = correctKeywords("Am三指发", LEXICON);
		expect(text).toBe("Am三指法");
		expect(corrections).toEqual([{ from: "三指发", to: "三指法" }]);
		expect(correctKeywords("Am三指法", LEXICON).corrections).toEqual([]);
	});
});

describe("typos through the readers", () => {
	it("reads a misspelt style word", () => {
		const r = readTabSentence("travs pickin in Am", INDEX);
		expect(r.style?.key).toBe("travis");
		expect(r.leftover).toBe("");
		expect(r.corrections.map((c) => c.to)).toEqual(["travis", "picking"]);
	});

	it("reads misspelt clause words", () => {
		expect(routeTabInput("strng:6654, fert:8-11-10-8", INDEX).path).toBe("notes");
		expect(routeTabInput("strings:6654, frets:8-11-10-8", INDEX).path).toBe("notes");
	});

	it("reads a misspelt note value and meter word", () => {
		const r = readTabSentence("Am 5 3 2 1 in sixteenhts, 三拍孑", INDEX);
		expect(r.duration).toBe("sixteenth");
		expect(r.timeSignature).toEqual([3, 4]);
		expect(r.leftover).toBe("");
	});

	it("does not correct a name the player typed", () => {
		const r = readTabSentence("Am: 5 3 2 1, name it travs", INDEX);
		expect(r.name).toBe("travs");
		expect(r.corrections).toEqual([]);
	});

	it("owns up to the correction in the reply", async () => {
		const out = await resolveTabTurn({ text: "travs picking in Am", index: INDEX, voicings: async () => voicingFor });
		expect(out.proposal?.name).toBe("Travis in Am");
		expect(out.text).toMatch(/Took “travs” as “travis”/);
		const zh = await resolveTabTurn({ text: "Am三指发", index: INDEX, uiLang: "zh", voicings: async () => voicingFor });
		expect(zh.text).toMatch(/把“三指发”当作“三指法”读了/);
	});
});

describe("typos through the strum readers", () => {
	it("reads a misspelt style word and tempo", async () => {
		const { resolveAssistantTurn } = await import("@/lib/strumAssistant/turn");
		const out = resolveAssistantTurn({ text: "a slwoer balad strum in C G Am F", index: INDEX });
		expect(out.proposal?.bpm).toBeLessThan(65);
		expect(out.text).toMatch(/Took “slwoer” as “slower”, “balad” as “ballad”/);
	});

	it("reads a misspelt edit verb, and leaves the pattern's own name alone", async () => {
		const { resolveAssistantTurn } = await import("@/lib/strumAssistant/turn");
		const patterns = [{ id: "p1", name: "belief" }, { id: "p2", name: "travs" }];
		const out = resolveAssistantTurn({ text: "renmae belief to travs", index: INDEX, patterns });
		expect(out.edit?.kind).toBe("rename");
		expect(out.edit?.kind === "rename" && out.edit.newName).toBe("travs");
		expect(out.text).toMatch(/Took “renmae” as “rename”/);
		expect(out.text).not.toMatch(/“travs” as/);
		const del = resolveAssistantTurn({ text: "delte travs", index: INDEX, patterns });
		expect(del.edit?.kind).toBe("delete");
		expect(del.edit?.kind === "delete" && del.edit.pattern.name).toBe("travs");
	});
});
