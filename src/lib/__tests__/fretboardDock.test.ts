import { describe, expect, it } from "vitest";
import { makeEmptySlot, setFret, toggleMuted } from "@/lib/fingerpickEdit";
import { pitchLabel, soundingMidi } from "@/lib/fingerpickPitch";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import {
	ALL_FRETS,
	PAGE_COUNT,
	SWIPE_MIN_PX,
	dockLabel,
	dockRow,
	dockWrite,
	fretButtonName,
	fretsOnPage,
	inlayDots,
	pageForFret,
	swipePage,
} from "@/lib/fretboardDock";

function tab(): FingerpickPattern {
	return { id: "t", name: "T", bpm: 90, timeSignature: [4, 4], measures: [{ id: "m", slots: [makeEmptySlot("quarter")] }] };
}
const cell = { measureIndex: 0, slotIndex: 0, stringIndex: 1 };
const at = (p: FingerpickPattern, s = 1) => p.measures[0].slots[0].strings[s];

describe("the neck and its pages", () => {
	it("is frets 0–24, five to a page", () => {
		expect(ALL_FRETS).toHaveLength(25);
		expect(PAGE_COUNT).toBe(5);
		expect(fretsOnPage(0)).toEqual([0, 1, 2, 3, 4]);
		expect(fretsOnPage(4)).toEqual([20, 21, 22, 23, 24]);
	});

	it("puts a fret on its page, edges included", () => {
		expect(pageForFret(0)).toBe(0);
		expect(pageForFret(4)).toBe(0);
		expect(pageForFret(5)).toBe(1);
		expect(pageForFret(19)).toBe(3);
		expect(pageForFret(24)).toBe(4);
		expect(pageForFret(30)).toBe(4);
	});

	it("turns a page only on a swipe of at least 40px, and not past either end", () => {
		expect(swipePage(1, -(SWIPE_MIN_PX - 1))).toBe(1);
		expect(swipePage(1, -SWIPE_MIN_PX)).toBe(2);
		expect(swipePage(1, SWIPE_MIN_PX)).toBe(0);
		expect(swipePage(0, 200)).toBe(0);
		expect(swipePage(4, -200)).toBe(4);
	});

	it("dots the usual frets, two at the octaves", () => {
		expect([3, 5, 7, 9, 12, 15, 24].map(inlayDots)).toEqual([1, 1, 1, 1, 2, 1, 2]);
		expect(inlayDots(0)).toBe(0);
		expect(inlayDots(11)).toBe(0);
	});
});

describe("dockWrite", () => {
	it("writes the fret, and clears it on a second click", () => {
		const once = dockWrite(tab(), cell, 3, false);
		expect(at(once)).toMatchObject({ fret: 3, muted: false });
		expect(at(dockWrite(once, cell, 3, false)).fret).toBeNull();
		expect(at(dockWrite(once, cell, 5, false)).fret).toBe(5);
	});

	it("writes an x on Shift, and takes it away again", () => {
		const x = dockWrite(setFret(tab(), cell, 3), cell, 7, true);
		expect(at(x)).toMatchObject({ fret: null, muted: true });
		expect(at(dockWrite(x, cell, 7, true)).muted).toBe(false);
	});

	it("leaves the other strings alone", () => {
		const p = dockWrite(setFret(tab(), { ...cell, stringIndex: 4 }, 3), cell, 1, false);
		expect(at(p, 4).fret).toBe(3);
	});
});

describe("labels", () => {
	it("agrees with the reader's pitch row in every style, capo folded in", () => {
		for (const [s, f, capo] of [
			[0, 0, 0],
			[1, 1, 0],
			[5, 3, 2],
			[2, 12, 5],
		] as const) {
			expect(dockLabel(s, f, capo, "fret")).toBe(String(f));
			expect(dockLabel(s, f, capo, "name")).toBe(pitchLabel(soundingMidi(s, f, capo), "name"));
			expect(dockLabel(s, f, capo, "jianpu")).toBe(pitchLabel(soundingMidi(s, f, capo), "jianpu"));
		}
		expect(dockLabel(1, 1, 0, "name")).toBe("C");
		// The A string's third fret is C3: jianpu leaves C3–B3 undotted (guitar is written an octave up).
		expect(dockLabel(4, 3, 0, "jianpu")).toBe("1");
		expect(dockLabel(5, 0, 0, "jianpu")).toBe(`3${"̣"}`);
	});

	it("names each button by string and fret", () => {
		expect(fretButtonName(1, 3, null, false)).toBe("String 2, fret 3");
		expect(fretButtonName(5, 0, null, true)).toBe("String 6, open, in the shape");
		expect(fretButtonName(0, 5, "note", false)).toBe("String 1, fret 5, written");
	});
});

describe("dockRow", () => {
	it("reads the written fret, an x and the shape's hint", () => {
		let p = setFret(tab(), cell, 3);
		p = toggleMuted(p, { ...cell, stringIndex: 5 });
		const hints = [0, 1, 0, 2, 3, "/"] as const;
		expect(dockRow(p, cell, 1, hints)).toEqual({ written: 3, hint: 1 });
		expect(dockRow(p, cell, 5, hints)).toEqual({ written: "x", hint: null });
		expect(dockRow(p, cell, 2, null)).toEqual({ written: null, hint: null });
	});
});
