import { describe, expect, it } from "vitest";
import type { BeatSlot, FingerpickPattern } from "@/lib/fingerpickTypes";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import { patternToAsciiTab } from "@/lib/mcp/asciiTab";

const silent = (): BeatSlot["strings"][number] => ({ fret: null, technique: null, tied: false, muted: false });

function slot(duration: BeatSlot["duration"], notes: Record<number, Partial<BeatSlot["strings"][number]>>, extra: Partial<BeatSlot> = {}): BeatSlot {
	const strings = [silent(), silent(), silent(), silent(), silent(), silent()] as BeatSlot["strings"];
	for (const [index, note] of Object.entries(notes)) strings[Number(index)] = { ...silent(), ...note };
	return { id: `s${Math.random()}`, duration, strings, ...extra };
}

function pattern(slots: BeatSlot[][], over: Partial<FingerpickPattern> = {}): FingerpickPattern {
	return {
		id: "p",
		name: "Test",
		bpm: 80,
		timeSignature: [4, 4],
		measures: slots.map((s, i) => ({ id: `m${i}`, slots: s })),
		...over,
	};
}

describe("patternToAsciiTab", () => {
	it("writes six lines, high e first, the same length, with bars between", () => {
		const text = patternToAsciiTab(
			pattern([
				[slot("quarter", { 0: { fret: 0 } }), slot("quarter", { 1: { fret: 1 } }), slot("half", { 5: { fret: 3 } })],
				[slot("whole", { 2: { fret: 2 } })],
			]),
		);
		const lines = text.split("\n");
		expect(lines).toHaveLength(6);
		expect(lines.map((l) => l.slice(0, 2))).toEqual(["e|", "B|", "G|", "D|", "A|", "E|"]);
		expect(new Set(lines.map((l) => l.length)).size).toBe(1);
		expect(lines.every((l) => l.endsWith("|"))).toBe(true);
		// Shortest value is a quarter: two columns each, four for the half, eight for the whole.
		expect(lines[0]).toBe("e|0-------|--------|");
		expect(lines[1]).toBe("B|--1-----|--------|");
		expect(lines[5]).toBe("E|----3---|--------|");
		expect(lines[2]).toBe("G|--------|2-------|");
	});

	it("gives a slot two columns per shortest note value, so the spacing is the rhythm", () => {
		const text = patternToAsciiTab(pattern([[slot("eighth", { 0: { fret: 1 } }), slot("eighth", { 0: { fret: 2 } }), slot("quarter", { 0: { fret: 3 } })]]));
		expect(text.split("\n")[0]).toBe("e|1-2-3---|");
	});

	it("marks techniques, ties and dead notes", () => {
		const text = patternToAsciiTab(
			pattern([
				[
					slot("quarter", { 0: { fret: 5 } }),
					slot("quarter", { 0: { fret: 7, technique: "hammer-on" } }),
					slot("quarter", { 0: { fret: 7, tied: true } }),
					slot("quarter", { 0: { fret: 0, muted: true } }),
				],
			]),
		);
		// Two columns a quarter; a mark that does not fit widens its own column only.
		expect(text.split("\n")[0]).toBe("e|5-h7-(7)-x-|");
	});

	it("writes bends after the fret the way tab does, and vibrato as a tilde", () => {
		const text = patternToAsciiTab(
			pattern([
				[
					slot("quarter", { 2: { fret: 7, technique: "bend-full" } }),
					slot("quarter", { 2: { fret: 7, technique: "bend-release", bendTarget: 1 } }),
					slot("quarter", { 2: { fret: 7, technique: "pre-bend", bendTarget: 2 } }),
					slot("quarter", { 2: { fret: 7, technique: "vibrato-wide" } }),
				],
				[
					slot("half", { 2: { fret: 5, technique: "bend-quarter" } }),
					slot("half", { 2: { fret: 5, technique: "vibrato" } }),
				],
			]),
		);
		const g = text.split("\n")[2];
		expect(g).toBe("G|7b9-7b8r-7pb9-7~~-|5b¼-5~--|");
	});

	it("writes P.M. and let-ring brackets on lines below, one run each", () => {
		const text = patternToAsciiTab(
			pattern([
				[
					slot("quarter", { 4: { fret: 0, palmMute: true } }),
					slot("quarter", { 4: { fret: 0, palmMute: true } }),
					slot("quarter", { 4: { fret: 2 } }),
					slot("quarter", { 0: { fret: 3, letRing: true }, 4: { fret: 2, palmMute: true } }),
				],
			]),
		);
		const lines = text.split("\n");
		expect(lines).toHaveLength(8);
		const [e, , , , a, , pm, lr] = lines;
		// A run is its label then dashes to the run's end; a label widens its column.
		expect(pm).toMatch(/^ {2}P\.M\.-+ +P\.M\.-*$/);
		expect(lr).toMatch(/^ +let ring-*$/);
		// Each label starts under the column of the note that opens its run.
		expect(pm.indexOf("P.M.")).toBe(a.indexOf("0"));
		expect(pm.lastIndexOf("P.M.")).toBe(a.lastIndexOf("2"));
		expect(lr.indexOf("let ring")).toBe(e.indexOf("3"));
		// The dashes stop where the run does: the plain 2 has none under it.
		expect(pm[a.indexOf("2")]).toBe(" ");
	});

	it("widens a column for a two-digit fret and writes a rest as dashes", () => {
		const text = patternToAsciiTab(pattern([[slot("eighth", { 0: { fret: 12 } }), slot("eighth", {}, { isRest: true }), slot("quarter", { 1: { fret: 1 } }), slot("half", {}, { isRest: true })]]));
		const lines = text.split("\n");
		expect(lines[0]).toBe("e|12---------------|");
		expect(lines[1]).toBe("B|-----1-----------|");
	});

	it("writes a chord line above when a slot carries a chord", () => {
		const text = patternToAsciiTab(
			pattern([
				[slot("half", { 0: { fret: 0 } }, { chord: { root: "A", suffix: "minor", voicingId: null } }), slot("half", { 0: { fret: 0 } })],
				[slot("whole", { 0: { fret: 1 } }, { chord: { root: "F", suffix: "major", voicingId: null } })],
			]),
		);
		const lines = text.split("\n");
		expect(lines).toHaveLength(7);
		// Halves are the shortest value here, so two columns each; "Am" widens its slot to three.
		expect(lines[0]).toBe("  Am    F");
		expect(lines[1]).toBe("e|0--0-|1---|");
	});

	it("caps the width of a long note so a whole over 32nds stays readable", () => {
		const text = patternToAsciiTab(pattern([[slot("32nd", { 0: { fret: 1 } }), slot("32nd", { 0: { fret: 2 } }), slot("32nd", { 0: { fret: 3 } }), slot("32nd", { 0: { fret: 4 } }), slot("half", { 0: { fret: 5 } })], [slot("whole", { 0: { fret: 6 } })]]));
		const line = text.split("\n")[0];
		expect(line).toBe("e|1-2-3-4-5---------------|6---------------|");
	});

	it("writes every preset without throwing", () => {
		for (const preset of PRESET_FINGERPICK_PATTERNS) {
			const lines = patternToAsciiTab(preset).split("\n");
			// The six string lines, wherever the chord line above or the bracket lines below put them.
			const staff = lines.filter((l) => /^[eBGDAE]\|/.test(l));
			expect(staff, preset.name).toHaveLength(6);
			expect(new Set(staff.map((l) => l.length)).size, preset.name).toBe(1);
		}
	});
});
