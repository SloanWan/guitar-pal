import { describe, it, expect } from "vitest";
import {
	effectiveChords,
	patternHasChords,
	setSlotChord,
	chordSymbolLabel,
	chordFretHints,
	fillColumnFromChord,
	patternCapo,
	setPatternCapo,
	clearLeftOutStrings,
	clearString,
	heldButUnplucked,
	chordRegionEnd,
} from "@/lib/fingerpickChords";
import { makeEmptySlot, setFret, toggleMuted } from "@/lib/fingerpickEdit";
import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import type { ChordRef } from "@/lib/strumPatterns";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

function voicing(overrides: Partial<ChordVoicing> = {}): ChordVoicing {
	return {
		id: "v",
		label: null,
		start_fret: 1,
		barre_fret: null,
		capo: false,
		frets: "x32010",
		fingers: "032010",
		...overrides,
	};
}

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

describe("chordFretHints", () => {
	it("reads open-position frets off the shape in fingerpick order, high e first", () => {
		// Voicing tables run low E → high e; slot strings run high e → low E.
		expect(chordFretHints(voicing())).toEqual([0, 1, 0, 2, 3, "/"]);
	});

	it("gives absolute frets for a shape up the neck", () => {
		// F-shape barre at the 8th fret = C major.
		const v = voicing({ start_fret: 8, barre_fret: 1, capo: true, frets: "133211", fingers: "134211" });
		expect(chordFretHints(v)).toEqual([8, 8, 9, 10, 10, 8]);
	});

	it("hints '/' rather than 'x' for a string the shape leaves out", () => {
		expect(chordFretHints(voicing({ frets: "xx0232" }))).toEqual([2, 3, 2, 0, "/", "/"]);
	});
});

describe("fillColumnFromChord", () => {
	const target = { measureIndex: 0, slotIndex: 0 };

	it("writes the shape's frets into the empty cells and skips left-out strings", () => {
		const out = fillColumnFromChord(pattern([measure("a", [undefined])]), target, voicing());
		expect(out.measures[0].slots[0].strings.map((sf) => sf.fret)).toEqual([
			0, 1, 0, 2, 3, null,
		]);
	});

	it("leaves cells that already hold a fret or a dead note alone", () => {
		let p = pattern([measure("a", [undefined])]);
		p = setFret(p, { ...target, stringIndex: 1 }, 5);
		p = toggleMuted(p, { ...target, stringIndex: 2 });
		const out = fillColumnFromChord(p, target, voicing());
		const strings = out.measures[0].slots[0].strings;
		expect(strings[1].fret).toBe(5);
		expect(strings[2].muted).toBe(true);
		expect(strings[2].fret).toBeNull();
		expect(strings.map((sf) => sf.fret)).toEqual([0, 5, null, 2, 3, null]);
	});

	it("is a no-op on a slot that does not exist", () => {
		const p = pattern([measure("a", [undefined])]);
		expect(fillColumnFromChord(p, { measureIndex: 3, slotIndex: 0 }, voicing())).toBe(p);
	});
});

describe("pattern capo", () => {
	it("reads 0 for a pattern without one, and the fret otherwise", () => {
		const p = pattern([measure("a", [undefined])]);
		expect(patternCapo(p)).toBe(0);
		expect(patternCapo({ ...p, capo: 4 })).toBe(4);
	});

	it("setPatternCapo stores a fret and removes the key at 0", () => {
		const p = pattern([measure("a", [undefined])]);
		expect(setPatternCapo(p, 2).capo).toBe(2);
		expect("capo" in setPatternCapo(setPatternCapo(p, 2), 0)).toBe(false);
	});

	it("clamps and rounds what it is handed", () => {
		const p = pattern([measure("a", [undefined])]);
		expect(setPatternCapo(p, 2.6).capo).toBe(3);
		expect(setPatternCapo(p, 99).capo).toBe(12);
		expect("capo" in setPatternCapo(p, -1)).toBe(false);
	});
});

describe("clearLeftOutStrings", () => {
	// C (x32010) leaves out the low E: fingerpick index 5.
	it("clears notes and dead notes on the shape's left-out strings, under that chord only", () => {
		let p = pattern([measure("a", [C, undefined, Am, undefined])]);
		p = setFret(p, { measureIndex: 0, slotIndex: 0, stringIndex: 5 }, 3);
		p = toggleMuted(p, { measureIndex: 0, slotIndex: 1, stringIndex: 5 });
		p = setFret(p, { measureIndex: 0, slotIndex: 1, stringIndex: 0 }, 0);
		// Under Am from slot 2 on — not this chord's region, left alone.
		p = setFret(p, { measureIndex: 0, slotIndex: 3, stringIndex: 5 }, 0);
		const out = clearLeftOutStrings(p, 0, C, voicing());
		const low = out.measures[0].slots.map((s) => s.strings[5]);
		expect(low[0].fret).toBeNull();
		expect(low[1].muted).toBe(false);
		expect(low[3].fret).toBe(0);
		expect(out.measures[0].slots[1].strings[0].fret).toBe(0);
	});

	it("leaves other measures alone and is a no-op for a shape that sounds every string", () => {
		let p = pattern([measure("a", [C]), measure("b", [undefined])]);
		p = setFret(p, { measureIndex: 1, slotIndex: 0, stringIndex: 5 }, 3);
		const out = clearLeftOutStrings(p, 0, C, voicing());
		expect(out.measures[1]).toBe(p.measures[1]);
		expect(clearLeftOutStrings(p, 0, C, voicing({ frets: "320003" }))).toBe(p);
	});
});

describe("clearString", () => {
	it("empties one string in one measure, or in every measure", () => {
		let p = pattern([measure("a", [undefined, undefined]), measure("b", [undefined])]);
		p = setFret(p, { measureIndex: 0, slotIndex: 0, stringIndex: 2 }, 5);
		p = toggleMuted(p, { measureIndex: 0, slotIndex: 1, stringIndex: 2 });
		p = setFret(p, { measureIndex: 1, slotIndex: 0, stringIndex: 2 }, 7);
		p = setFret(p, { measureIndex: 0, slotIndex: 0, stringIndex: 3 }, 1);
		const one = clearString(p, 2, 0);
		expect(one.measures[0].slots.map((s) => s.strings[2].fret)).toEqual([null, null]);
		expect(one.measures[0].slots[1].strings[2].muted).toBe(false);
		expect(one.measures[1].slots[0].strings[2].fret).toBe(7);
		expect(one.measures[0].slots[0].strings[3].fret).toBe(1);
		const all = clearString(p, 2);
		expect(all.measures[1].slots[0].strings[2].fret).toBeNull();
	});

	it("returns the same pattern when the string is already empty", () => {
		const p = pattern([measure("a", [undefined])]);
		expect(clearString(p, 4)).toBe(p);
	});
});

describe("heldButUnplucked", () => {
	// C = x32010 → fingerpick order e0 B1 G0 D2 A3 E/.
	it("reports held strings nothing in the range plucks, never left-out ones", () => {
		let p = pattern([measure("a", [C, undefined, undefined, undefined])]);
		p = setFret(p, { measureIndex: 0, slotIndex: 0, stringIndex: 4 }, 3); // A plucked
		p = setFret(p, { measureIndex: 0, slotIndex: 2, stringIndex: 1 }, 1); // B plucked
		p = toggleMuted(p, { measureIndex: 0, slotIndex: 3, stringIndex: 2 }); // G struck dead
		const out = heldButUnplucked(p.measures[0].slots, 0, 4, voicing());
		expect(out).toEqual([true, false, false, true, false, false]);
	});

	it("only looks inside the given slot range", () => {
		let p = pattern([measure("a", [C, undefined, Am, undefined])]);
		p = setFret(p, { measureIndex: 0, slotIndex: 3, stringIndex: 0 }, 0); // e, but after the region
		const out = heldButUnplucked(p.measures[0].slots, 0, 2, voicing());
		expect(out[0]).toBe(true);
	});
});

describe("chordRegionEnd", () => {
	it("stops at the next mark, else at the measure end", () => {
		const m = measure("a", [C, undefined, Am, undefined]);
		expect(chordRegionEnd(m, 0)).toBe(2);
		expect(chordRegionEnd(m, 2)).toBe(4);
	});
});
