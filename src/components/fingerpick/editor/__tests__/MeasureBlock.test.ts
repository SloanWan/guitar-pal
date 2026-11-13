import { describe, it, expect } from "vitest";
import type { BeatSlot } from "@/lib/fingerpickTypes";
import { makeDefaultPattern, setFret, toggleMuted } from "@/lib/fingerpickEdit";
import { setPercussion } from "@/lib/fingerpickTechniqueEdit";
import { noteText, struckByHit } from "@/components/fingerpick/editor/MeasureBlock";

const at = { measureIndex: 0, slotIndex: 0 };
function slotWith(edit: (p: ReturnType<typeof makeDefaultPattern>) => ReturnType<typeof makeDefaultPattern>): BeatSlot {
	return edit(makeDefaultPattern()).measures[0].slots[0];
}

/** A hit on an empty slot is written: the grid shows the strings it strikes dead, as it plays them. */
describe("struckByHit", () => {
	it("marks the empty strings a slap strikes: all six", () => {
		const slot = slotWith((p) => setPercussion(p, at, { kind: "slap" }));
		expect([0, 1, 2, 3, 4, 5].map((i) => struckByHit(slot, i))).toEqual([true, true, true, true, true, true]);
		expect(noteText(slot, 0)).toBe("x (Slap)");
	});

	it("marks only the bass strings for a thumb slap, and none for a body tap", () => {
		const thumb = slotWith((p) => setPercussion(p, at, { kind: "thumbSlap" }));
		expect([0, 1, 2, 3, 4, 5].map((i) => struckByHit(thumb, i))).toEqual([false, false, false, true, true, true]);
		const tap = slotWith((p) => setPercussion(p, at, { kind: "bodyTap" }));
		expect([0, 1, 2, 3, 4, 5].some((i) => struckByHit(tap, i))).toBe(false);
	});

	it("leaves a string's own note alone, fret or x", () => {
		const slot = slotWith((p) =>
			setPercussion(toggleMuted(setFret(p, { ...at, stringIndex: 0 }, 3), { ...at, stringIndex: 1 }), at, { kind: "slap" }),
		);
		expect(struckByHit(slot, 0)).toBe(false);
		expect(struckByHit(slot, 1)).toBe(false);
		expect(noteText(slot, 0)).toBe("fret 3");
		expect(noteText(slot, 1)).toBe("x");
		expect(struckByHit(slot, 2)).toBe(true);
	});

	it("is nothing without a hit", () => {
		const slot = slotWith((p) => p);
		expect(struckByHit(slot, 0)).toBe(false);
		expect(noteText(slot, 0)).toBe("empty");
	});
});
