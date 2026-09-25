import { describe, it, expect } from "vitest";
import { proposeStrum, proposeTab, readInput, showChord, strumReadResult, tabReadResult } from "@/lib/assistant/general/execute";
import { resolveAssistantTurn } from "@/lib/assistant/strum/turn";
import { resolveTabTurn } from "@/lib/assistant/tab/turn";
import { INDEX, voicingFor } from "@/lib/assistant/tab/__tests__/fixtures";

const voicings = async () => voicingFor;

describe("readInput", () => {
	it("accepts what each tool needs and nothing less", () => {
		expect(readInput("read_strum", { text: "C G" })).toMatchObject({ ok: true });
		expect(readInput("read_tab", { text: "  " })).toMatchObject({ ok: false });
		expect(readInput("propose_strum", { name: "x", rhythm: "D DU", chords: ["C"], bpm: 0 })).toMatchObject({ ok: true });
		expect(readInput("propose_strum", { name: "x", rhythm: "D DU", chords: [1], bpm: 0 })).toMatchObject({ ok: false });
		expect(readInput("propose_tab", { name: "x", tab: "e|--", bpm: 0, timeSignature: "" })).toMatchObject({ ok: true });
		expect(readInput("propose_tab", "nope")).toMatchObject({ ok: false });
		expect(readInput("show_chord", { chords: ["F#m7"] })).toMatchObject({ ok: true });
		expect(readInput("show_chord", { chords: [] })).toMatchObject({ ok: false });
		expect(readInput("show_chord", { chords: [" "] })).toMatchObject({ ok: false });
	});
});

describe("show_chord", () => {
	it("finds the chord and hands back a chord card", () => {
		const r = showChord({ chords: ["F#m7"] }, INDEX);
		expect(r.isError).toBe(false);
		expect(r.result).toMatch(/Found F#m7/);
		expect(r.card).toEqual({ domain: "chord", chords: [{ root: "F#", suffix: "m7", voicingId: null }] });
	});

	it("keeps several chords in the order asked", () => {
		const r = showChord({ chords: ["C", "Am", "F", "G"] }, INDEX);
		expect(r.isError).toBe(false);
		expect(r.result).toMatch(/grid/);
		expect((r.card as { chords: { root: string }[] }).chords.map((c) => c.root)).toEqual(["C", "A", "F", "G"]);
	});

	it("accepts the spellings the picker accepts", () => {
		const r = showChord({ chords: ["f♯m"] }, INDEX);
		expect(r.isError).toBe(false);
		expect(r.card).toMatchObject({ domain: "chord", chords: [{ root: "F#", suffix: "minor" }] });
	});

	it("is an error naming the words nothing in the library is called", () => {
		const r = showChord({ chords: ["C", "capo"] }, INDEX);
		expect(r.isError).toBe(true);
		expect(r.result).toMatch(/"capo"/);
		expect(r.card).toBeUndefined();
	});

	it("the readers answer a chord ask with the same card", () => {
		const r = strumReadResult(resolveAssistantTurn({ text: "how do I play Bm", index: INDEX }));
		expect(r.isError).toBe(false);
		expect(r.card).toMatchObject({ domain: "chord", chords: [{ root: "B", suffix: "minor" }] });
	});
});

describe("reader results", () => {
	it("turns a strum proposal into a line and a card", () => {
		const outcome = resolveAssistantTurn({ text: "C G Am F", index: INDEX });
		const r = strumReadResult(outcome);
		expect(r.isError).toBe(false);
		expect(r.result).toMatch(/Read a progression .* 4 bar\(s\), chords C G Am F/);
		expect(r.card).toMatchObject({ domain: "strum" });
		expect(r.text).toBe(outcome.text);
	});

	it("is an error when the strum reader read nothing", () => {
		const r = strumReadResult(resolveAssistantTurn({ text: "make it sadder", index: INDEX }));
		expect(r.isError).toBe(true);
		expect(r.card).toBeUndefined();
	});

	it("turns a tab proposal into a line and a card", async () => {
		const outcome = await resolveTabTurn({ text: "Am: 5 3 2 1 3 2 1 3", index: INDEX, voicings });
		const r = tabReadResult(outcome);
		expect(r.isError).toBe(false);
		expect(r.result).toMatch(/Read a fingerpicking pattern/);
		expect(r.card).toMatchObject({ domain: "tab" });
	});

	it("is an error when the tab reader read nothing", async () => {
		const r = tabReadResult(await resolveTabTurn({ text: "make it sadder", index: INDEX, voicings }));
		expect(r.isError).toBe(true);
	});
});

describe("propose_strum", () => {
	it("builds a validated proposal from notation and chord words", () => {
		const r = proposeStrum({ name: "Slow folk", rhythm: "D DU UD", chords: ["C", "G", "Am", "F"], bpm: 72 }, INDEX);
		expect(r.isError).toBe(false);
		expect(r.card).toMatchObject({ domain: "strum", proposal: { name: "Slow folk", bpm: 72, kind: "progression" } });
		expect(r.result).toContain('Made "Slow folk": 4 bar(s)');
	});

	it("hands bad notation back as an error to fix", () => {
		const r = proposeStrum({ name: "x", rhythm: "D Q U", chords: [], bpm: 0 }, INDEX);
		expect(r.isError).toBe(true);
		expect(r.result).toMatch(/not valid notation/);
	});

	it("refuses an empty draft", () => {
		expect(proposeStrum({ name: "x", rhythm: "", chords: [], bpm: 0 }, INDEX).isError).toBe(true);
	});

	it("keeps unmatched chord words in the line rather than substituting", () => {
		const r = proposeStrum({ name: "x", rhythm: "D DU UD", chords: ["C", "Zx9"], bpm: 0 }, INDEX);
		expect(r.isError).toBe(false);
		expect(r.result).toContain("Zx9");
	});
});

describe("propose_tab", () => {
	const TAB = ["e|--------|", "B|----1---|", "G|--0---0-|", "D|--------|", "A|0-------|", "E|--------|"].join("\n");

	it("parses and validates a tab the way a paste is", () => {
		const r = proposeTab({ name: "Am roll", tab: TAB, bpm: 80, timeSignature: "" });
		expect(r.isError).toBe(false);
		expect(r.card).toMatchObject({ domain: "tab", tabProposal: { name: "Am roll", bpm: 80 } });
		if (r.card?.domain === "tab" && "tabProposal" in r.card) {
			expect(r.card.tabProposal.pattern.measures.length).toBe(1);
			expect(r.card.tabProposal.pattern.timeSignature).toEqual([4, 4]);
		}
	});

	it("takes a supported meter and refuses one it does not know", () => {
		const ok = proposeTab({ name: "w", tab: ["e|------|", "B|------|", "G|--0---|", "D|------|", "A|0-----|", "E|------|"].join("\n"), bpm: 0, timeSignature: "3/4" });
		expect(ok.isError).toBe(false);
		expect(proposeTab({ name: "w", tab: TAB, bpm: 0, timeSignature: "7/8" }).isError).toBe(true);
	});

	it("refuses a bar whose width does not divide the meter, naming the widths that do", () => {
		// Ten notes written the ordinary way, a dash between each: 21 columns.
		const scale = [
			"e|---------------------|",
			"B|---------------------|",
			"G|-------------5-7-----|",
			"D|-------5-7-----------|",
			"A|-5-7-----------------|",
			"E|---------------------|",
		].join("\n");
		const r = proposeTab({ name: "pentatonic", tab: scale, bpm: 0, timeSignature: "" });
		expect(r.isError).toBe(true);
		expect(r.card).toBeUndefined();
		expect(r.result).toContain("21 characters wide");
		expect(r.result).toContain("4, 8, 16 or 32 columns");
	});

	it("follows the meter when it says which widths are legal", () => {
		const wide = [
			"e|----------|",
			"B|----------|",
			"G|--0-------|",
			"D|----------|",
			"A|0---------|",
			"E|----------|",
		].join("\n");
		const r = proposeTab({ name: "w", tab: wide, bpm: 0, timeSignature: "3/4" });
		expect(r.isError).toBe(true);
		expect(r.result).toContain("4, 6, 8, 12 or 24 columns");
	});

	it("takes a bar that does divide the meter", () => {
		const even = [
			"e|----------------|",
			"B|------------1---|",
			"G|--------0-------|",
			"D|----------------|",
			"A|0---------------|",
			"E|----------------|",
		].join("\n");
		const r = proposeTab({ name: "even", tab: even, bpm: 0, timeSignature: "" });
		expect(r.isError).toBe(false);
		if (r.card?.domain === "tab" && "tabProposal" in r.card) {
			const codes = r.card.tabProposal.warnings.map((w) => w.code);
			expect(codes).not.toContain("ASCII_UNEVEN_BAR");
			expect(codes).not.toContain("ASCII_BAR_OVERFLOW");
		}
	});

	it("hands an unreadable tab back as an error", () => {
		const r = proposeTab({ name: "x", tab: "not a tab at all", bpm: 0, timeSignature: "" });
		expect(r.isError).toBe(true);
		expect(r.result).toMatch(/could not be read/);
	});
});
