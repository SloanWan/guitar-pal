import { describe, it, expect } from "vitest";
import { fingerpickToTabStrip, TAB_STRIP_WIDTH } from "../fingerpickToTabStrip";
import { PRESET_FINGERPICK_PATTERNS } from "../fingerpickPatterns";
import type { FingerpickPattern, StringFret } from "../fingerpickTypes";

const silent = (): StringFret => ({ fret: null, technique: null, tied: false, muted: false });
const note = (fret: number, extra: Partial<StringFret> = {}): StringFret => ({
	fret,
	technique: null,
	tied: false,
	muted: false,
	...extra,
});

/** Two bars of 4/4; the second bar's second note starts on beat 3. */
const TWO_BARS: FingerpickPattern = {
	id: "t",
	name: "t",
	bpm: 100,
	timeSignature: [4, 4],
	measures: [
		{
			id: "m1",
			slots: [
				{ id: "m1-1", duration: "half", strings: [note(3), silent(), silent(), silent(), silent(), silent()] },
				{ id: "m1-2", duration: "half", strings: [silent(), silent(), silent(), silent(), silent(), note(0)] },
			],
		},
		{
			id: "m2",
			slots: [
				{ id: "m2-1", duration: "half", strings: [note(1, { muted: true }), silent(), silent(), silent(), silent(), silent()] },
				{ id: "m2-2", duration: "half", strings: [note(2, { tied: true }), note(5), silent(), silent(), silent(), silent()] },
			],
		},
	],
};

describe("fingerpickToTabStrip", () => {
	it("puts one barline at the end of each bar, the last pulled in a pixel", () => {
		expect(fingerpickToTabStrip(TWO_BARS, 800).barlines).toEqual([400, 799]);
	});

	it("places a note by its bar and its beat, on its string's line", () => {
		const { notes } = fingerpickToTabStrip(TWO_BARS, 800);
		// Bar 1 spans 0–400 with a 12px inset either side: beat 1 at x=12, beat 3 halfway.
		expect(notes).toContainEqual([12, 14, "3"]); // high e, top line
		expect(notes).toContainEqual([200, 84, "0"]); // low E, bottom line
		// Bar 2 starts at 400.
		expect(notes).toContainEqual([600, 24 + 4, "5"]);
	});

	it("prints a muted note as x and skips a tied one", () => {
		const { notes } = fingerpickToTabStrip(TWO_BARS, 800);
		expect(notes).toContainEqual([412, 14, "x"]);
		expect(notes.some(([, , fret]) => fret === "2")).toBe(false);
	});

	it("fits every preset inside the strip", () => {
		for (const pattern of PRESET_FINGERPICK_PATTERNS) {
			const { barlines, notes } = fingerpickToTabStrip(pattern);
			expect(barlines).toHaveLength(pattern.measures.length);
			expect(barlines[barlines.length - 1]).toBe(TAB_STRIP_WIDTH - 1);
			for (const [x, y] of notes) {
				expect(x).toBeGreaterThanOrEqual(0);
				expect(x).toBeLessThan(TAB_STRIP_WIDTH);
				expect([14, 28, 42, 56, 70, 84]).toContain(y);
			}
		}
	});

	it("handles an empty pattern", () => {
		expect(fingerpickToTabStrip({ ...TWO_BARS, measures: [] })).toEqual({
			barlines: [TAB_STRIP_WIDTH - 1],
			notes: [],
		});
	});
});
