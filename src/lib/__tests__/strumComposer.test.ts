import { describe, it, expect } from "vitest";
import {
	MAX_PATTERN_BARS,
	emptyRhythmBar,
	parseComposerText,
	removeRhythmBar,
	resizeRhythm,
	rhythmSubdivision,
	rhythmText,
	setRhythmBarCount,
} from "@/lib/strumComposer";
import { PRESET_STRUM_PATTERNS, type Beat } from "@/lib/strumPatterns";

const OLD_FAITHFUL: Beat[] = [["D", ""], ["D", "U"], ["", "U"], ["D", ""]];

describe("rhythmText", () => {
	it("writes a bar a cell a character, bars between pipes", () => {
		expect(rhythmText([OLD_FAITHFUL])).toBe("D DU UD");
		expect(rhythmText([OLD_FAITHFUL, OLD_FAITHFUL])).toBe("D DU UD | D DU UD");
	});

	it("reads back to the same rhythm at the same subdivision", () => {
		for (const preset of PRESET_STRUM_PATTERNS) {
			const rhythm = [preset.beats];
			const sub = rhythmSubdivision(rhythm);
			if (sub === null) continue;
			const back = parseComposerText(rhythmText(rhythm), [4, 4], sub);
			expect(back).toEqual({ ok: true, rhythm });
		}
	});
});

describe("rhythmSubdivision", () => {
	it("is the shared count, or null when beats differ", () => {
		expect(rhythmSubdivision([OLD_FAITHFUL])).toBe(2);
		expect(rhythmSubdivision([[["D", "U", "D"], ["D", ""]]])).toBeNull();
	});
});

describe("parseComposerText", () => {
	it("keeps the chosen subdivision when the strokes fit it", () => {
		const parsed = parseComposerText("D", [4, 4], 4);
		expect(parsed.ok && parsed.rhythm[0][0]).toEqual(["D", "", "", ""]);
	});

	it("widens the subdivision when the strokes need it", () => {
		const parsed = parseComposerText("DUDUDUDUDUDU", [4, 4], 2);
		expect(parsed.ok && parsed.rhythm[0][0]).toHaveLength(3);
	});

	it("says what is wrong with the strokes", () => {
		const parsed = parseComposerText("DQ", [4, 4], 2);
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) expect(parsed.message).toMatch(/"Q"/);
	});

	it("refuses more bars than a pattern runs to", () => {
		const text = Array.from({ length: MAX_PATTERN_BARS + 1 }, () => "D").join(" | ");
		expect(parseComposerText(text, [4, 4], 2).ok).toBe(false);
	});

	it("counts a compound bar in its own beats", () => {
		const parsed = parseComposerText("D  D", [6, 8], 3);
		expect(parsed.ok && parsed.rhythm[0]).toEqual([["D", "", ""], ["D", "", ""]]);
	});
});

describe("bar edits", () => {
	it("makes an empty bar of the meter", () => {
		expect(emptyRhythmBar([3, 4])).toEqual([["", ""], ["", ""], ["", ""]]);
	});

	it("re-divides every beat, keeping strokes where they fall", () => {
		expect(resizeRhythm([OLD_FAITHFUL], 4)[0][1]).toEqual(["D", "", "U", ""]);
	});

	it("grows with empty bars at the current subdivision, and shrinks from the end", () => {
		const grown = setRhythmBarCount([OLD_FAITHFUL], 3, [4, 4]);
		expect(grown).toHaveLength(3);
		expect(grown[2]).toEqual(emptyRhythmBar([4, 4], 2));
		expect(setRhythmBarCount(grown, 0, [4, 4])).toEqual([OLD_FAITHFUL]);
	});

	it("never removes the last bar", () => {
		expect(removeRhythmBar([OLD_FAITHFUL], 0)).toEqual([OLD_FAITHFUL]);
		expect(removeRhythmBar([OLD_FAITHFUL, emptyRhythmBar([4, 4])], 0)).toEqual([emptyRhythmBar([4, 4])]);
	});
});
