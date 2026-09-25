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
		expect(readInput("propose_tab", { name: "x", slotsPerBar: 8, bars: [{ notes: [{ string: 1, fret: 0, slot: 0 }] }], bpm: 0, timeSignature: "" })).toMatchObject({ ok: true });
		expect(readInput("propose_tab", { name: "x", slotsPerBar: 8, bars: [{ notes: [{ string: 1, fret: "0", slot: 0 }] }], bpm: 0, timeSignature: "" })).toMatchObject({ ok: false });
		expect(readInput("propose_tab", { name: "x", slotsPerBar: 8, bars: "e|--", bpm: 0, timeSignature: "" })).toMatchObject({ ok: false });
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
	const scale = (frets: readonly [number, number][]) => ({
		notes: frets.map(([string, fret], slot) => ({ string, fret, slot })),
	});

	it("places notes on the slots it was given", () => {
		const r = proposeTab({
			name: "Am roll",
			slotsPerBar: 8,
			bars: [{ notes: [{ string: 5, fret: 0, slot: 0 }, { string: 3, fret: 0, slot: 2 }, { string: 2, fret: 1, slot: 4 }] }],
			bpm: 80,
			timeSignature: "",
		});
		expect(r.isError).toBe(false);
		expect(r.card).toMatchObject({ domain: "tab", tabProposal: { name: "Am roll", bpm: 80 } });
		if (r.card?.domain === "tab" && "tabProposal" in r.card) {
			const { pattern, warnings } = r.card.tabProposal;
			expect(pattern.measures).toHaveLength(1);
			expect(pattern.timeSignature).toEqual([4, 4]);
			expect(warnings).toEqual([]);
			// Slot 0 sounds the A string; slot 4 the B string at the first fret.
			expect(pattern.measures[0].slots[0].strings[4].fret).toBe(0);
			expect(pattern.measures[0].slots[2].strings[1].fret).toBe(1);
		}
	});

	it("writes a scale over as many bars as its notes need, with no warning", () => {
		const up = [[6, 5], [6, 8], [5, 5], [5, 7], [4, 5], [4, 7], [3, 5], [3, 7]] as const;
		const down = [[3, 7], [3, 5], [4, 7], [4, 5], [5, 7], [5, 5], [6, 8], [6, 5]] as const;
		const r = proposeTab({
			name: "A minor pentatonic",
			slotsPerBar: 8,
			bars: [scale(up), scale(down)],
			bpm: 80,
			timeSignature: "",
		});
		expect(r.isError).toBe(false);
		if (r.card?.domain === "tab" && "tabProposal" in r.card) {
			expect(r.card.tabProposal.pattern.measures).toHaveLength(2);
			expect(r.card.tabProposal.warnings).toEqual([]);
		}
	});

	it("keeps two-digit frets apart — the thing ASCII could not do", () => {
		const r = proposeTab({
			name: "twelfth position",
			slotsPerBar: 8,
			bars: [scale([[6, 12], [6, 15], [5, 12], [5, 14], [4, 12], [4, 14], [3, 12], [3, 14]])],
			bpm: 0,
			timeSignature: "",
		});
		expect(r.isError).toBe(false);
		if (r.card?.domain === "tab" && "tabProposal" in r.card) {
			const frets = r.card.tabProposal.pattern.measures[0].slots
				.flatMap((slot) => slot.strings.map((sf) => sf.fret))
				.filter((f): f is number => f !== null);
			expect(frets).toEqual([12, 15, 12, 14, 12, 14, 12, 14]);
		}
	});

	it("carries the model's tempo without a bpm warning", () => {
		const r = proposeTab({ name: "Am roll", slotsPerBar: 8, bars: [{ notes: [{ string: 5, fret: 0, slot: 0 }] }], bpm: 96, timeSignature: "" });
		expect(r.result).not.toMatch(/bpm/i);
		if (r.card?.domain === "tab" && "tabProposal" in r.card) {
			expect(r.card.tabProposal.pattern.bpm).toBe(96);
		}
	});

	it("says nothing about the tempo when none was asked for", () => {
		const r = proposeTab({ name: "Am roll", slotsPerBar: 8, bars: [{ notes: [{ string: 5, fret: 0, slot: 0 }] }], bpm: 0, timeSignature: "" });
		expect(r.result).not.toMatch(/bpm/i);
		if (r.card?.domain === "tab" && "tabProposal" in r.card) {
			expect(r.card.tabProposal.bpm).toBeNull();
			expect(r.card.tabProposal.pattern.bpm).toBe(80);
			expect(r.card.tabProposal.warnings).toEqual([]);
		}
	});

	it("refuses a slot grid the meter cannot be divided into, naming the ones it can", () => {
		const r = proposeTab({ name: "x", slotsPerBar: 12, bars: [{ notes: [] }], bpm: 0, timeSignature: "" });
		expect(r.isError).toBe(true);
		expect(r.card).toBeUndefined();
		expect(r.result).toContain("2, 4, 8, 16 or 32");
	});

	it("follows the meter when it says which grids are legal", () => {
		const ok = proposeTab({ name: "w", slotsPerBar: 6, bars: [{ notes: [{ string: 5, fret: 0, slot: 0 }] }], bpm: 0, timeSignature: "3/4" });
		expect(ok.isError).toBe(false);
		const no = proposeTab({ name: "w", slotsPerBar: 8, bars: [{ notes: [] }], bpm: 0, timeSignature: "3/4" });
		expect(no.isError).toBe(true);
		expect(no.result).toContain("2, 3, 4, 6, 12 or 24");
	});

	it("takes a supported meter and refuses one it does not know", () => {
		const bars = [{ notes: [{ string: 5, fret: 0, slot: 0 }] }];
		expect(proposeTab({ name: "w", slotsPerBar: 6, bars, bpm: 0, timeSignature: "6/8" }).isError).toBe(false);
		expect(proposeTab({ name: "w", slotsPerBar: 8, bars, bpm: 0, timeSignature: "7/8" }).isError).toBe(true);
	});

	it("refuses a note that falls outside its bar", () => {
		const r = proposeTab({ name: "x", slotsPerBar: 8, bars: [{ notes: [{ string: 1, fret: 0, slot: 9 }] }], bpm: 0, timeSignature: "" });
		expect(r.isError).toBe(true);
		expect(r.result).toContain("slot 9");
	});
});
