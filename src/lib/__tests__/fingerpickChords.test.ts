import { describe, it, expect } from "vitest";
import {
	effectiveChords,
	patternHasChords,
	setSlotChord,
	chordSymbolLabel,
} from "@/lib/fingerpickChords";
import { makeEmptySlot } from "@/lib/fingerpickEdit";
import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import type { ChordRef } from "@/lib/strumPatterns";

const C: ChordRef = { root: "C", suffix: "major" };
const Am: ChordRef = { root: "A", suffix: "minor" };
const G7: ChordRef = { root: "G", suffix: "7" };

function measure(id: string, chords: (ChordRef | undefined)[]): Measure {
	return {
		id,
		slots: chords.map((chord) => (chord ? { ...makeEmptySlot(), chord } : makeEmptySlot())),
	};
}

function pattern(measures: Measure[]): FingerpickPattern {
	return { id: "p", name: "t", description: "", bpm: 100, timeSignature: [4, 4], measures };
}

describe("effectiveChords", () => {
	it("is null everywhere when nothing is marked", () => {
		const out = effectiveChords([measure("a", [undefined, undefined])]);
		expect(out).toEqual([[null, null]]);
	});

	it("runs a mark forward to the next mark, across measure boundaries", () => {
		const out = effectiveChords([
			measure("a", [C, undefined, Am, undefined]),
			measure("b", [undefined, undefined, G7, undefined]),
			measure("c", [undefined]),
		]);
		expect(out).toEqual([
			[C, C, Am, Am],
			[Am, Am, G7, G7],
			[G7],
		]);
	});

	it("is null before the first mark only", () => {
		const out = effectiveChords([measure("a", [undefined, C]), measure("b", [undefined])]);
		expect(out).toEqual([[null, C], [C]]);
	});

	it("keeps the output index-aligned with the slots", () => {
		const measures = [measure("a", [undefined, C, undefined]), measure("b", [Am, undefined])];
		const out = effectiveChords(measures);
		expect(out.map((row) => row.length)).toEqual(measures.map((m) => m.slots.length));
	});
});

describe("patternHasChords", () => {
	it("is false with no marks and true with any", () => {
		expect(patternHasChords([measure("a", [undefined, undefined])])).toBe(false);
		expect(patternHasChords([measure("a", [undefined]), measure("b", [undefined, C])])).toBe(
			true,
		);
	});
});

describe("setSlotChord", () => {
	it("marks the targeted slot and nothing else", () => {
		const out = setSlotChord(pattern([measure("a", [undefined, undefined])]), {
			measureIndex: 0,
			slotIndex: 1,
		}, C);
		expect(out.measures[0].slots[0].chord).toBeUndefined();
		expect(out.measures[0].slots[1].chord).toEqual(C);
	});

	it("replaces an existing mark", () => {
		const out = setSlotChord(pattern([measure("a", [C])]), { measureIndex: 0, slotIndex: 0 }, Am);
		expect(out.measures[0].slots[0].chord).toEqual(Am);
	});

	it("clearing removes the key entirely, so the slot serialises as never marked", () => {
		const out = setSlotChord(pattern([measure("a", [C])]), { measureIndex: 0, slotIndex: 0 }, null);
		expect("chord" in out.measures[0].slots[0]).toBe(false);
	});

	it("does not mutate the input", () => {
		const input = pattern([measure("a", [undefined])]);
		setSlotChord(input, { measureIndex: 0, slotIndex: 0 }, C);
		expect(input.measures[0].slots[0].chord).toBeUndefined();
	});
});

describe("chordSymbolLabel", () => {
	it("writes chords the way a lead sheet does", () => {
		expect(chordSymbolLabel(C)).toBe("C");
		expect(chordSymbolLabel(Am)).toBe("Am");
		expect(chordSymbolLabel(G7)).toBe("G7");
		expect(chordSymbolLabel({ root: "F#", suffix: "m7b5" })).toBe("F#m7b5");
	});
});
