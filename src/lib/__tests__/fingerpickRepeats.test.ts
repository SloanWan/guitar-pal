import { describe, it, expect } from "vitest";

import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import {
	endingLabel,
	expandFingerpickPattern,
	impliedRepeatTimes,
	toggleEnding,
	voltaMarks,
	mapOriginToExpandedIndex,
	playOrder,
} from "@/lib/fingerpickRepeats";

// Minimal measure — repeat logic never inspects slots.
function m(id: string, repeat?: Partial<Pick<Measure, "repeatStart" | "repeatEnd" | "repeatTimes" | "ending">>): Measure {
	return { id, slots: [], ...repeat };
}

function pattern(measures: Measure[]): FingerpickPattern {
	return { id: "p", name: "p", measures, bpm: 120, timeSignature: [4, 4] };
}

// Original indices → the bars' ids, so an order reads like the page: "A B A C".
function sounds(measures: Measure[]): string {
	const { order, error } = playOrder(measures);
	if (error) throw new Error(error);
	return order.map((i) => measures[i].id).join(" ");
}

describe("playOrder", () => {
	it("plays a simple start/end twice", () => {
		expect(sounds([m("A", { repeatStart: true }), m("B", { repeatEnd: true }), m("C")])).toBe("A B A B C");
	});

	it("treats a measure with both flags as a single-measure repeat", () => {
		expect(sounds([m("A"), m("B", { repeatStart: true, repeatEnd: true, repeatTimes: 4 })])).toBe("A B B B B");
	});

	it("supports back-to-back repeats", () => {
		expect(
			sounds([
				m("A", { repeatStart: true }),
				m("B", { repeatEnd: true }),
				m("C", { repeatStart: true }),
				m("D", { repeatEnd: true, repeatTimes: 3 }),
			]),
		).toBe("A B A B C D C D C D");
	});

	it("clamps an out-of-range or invalid times back to the default", () => {
		expect(sounds([m("A", { repeatStart: true, repeatEnd: true, repeatTimes: 1 })])).toBe("A A");
		expect(sounds([m("A", { repeatStart: true, repeatEnd: true, repeatTimes: 2.9 })])).toBe("A A");
	});

	it("repeats from the start when a repeat end has no start", () => {
		expect(sounds([m("A"), m("B", { repeatEnd: true }), m("C")])).toBe("A B A B C");
	});

	it("repeats a bare end from just after the section before it", () => {
		expect(
			sounds([m("A", { repeatStart: true }), m("B", { repeatEnd: true }), m("C"), m("D", { repeatEnd: true })]),
		).toBe("A B A B C D C D");
	});

	it("plays first and second endings on their passes", () => {
		expect(
			sounds([
				m("A", { repeatStart: true }),
				m("B", { ending: [1], repeatEnd: true }),
				m("C", { ending: [2] }),
				m("D"),
			]),
		).toBe("A B A C D");
	});

	it("takes the play count from the endings: 1.2. then 3.", () => {
		expect(
			sounds([m("A", { repeatStart: true }), m("B", { ending: [1, 2], repeatEnd: true }), m("C", { ending: [3] })]),
		).toBe("A B A B A C");
	});

	it("goes back again from a repeat end inside a later ending", () => {
		expect(
			sounds([
				m("A", { repeatStart: true }),
				m("B", { ending: [1], repeatEnd: true }),
				m("C", { ending: [2], repeatEnd: true }),
				m("D", { ending: [3] }),
			]),
		).toBe("A B A C A D");
	});

	it("plays a multi-bar ending as one bracket", () => {
		expect(
			sounds([
				m("A", { repeatStart: true }),
				m("B1", { ending: [1] }),
				m("B2", { ending: [1], repeatEnd: true }),
				m("C1", { ending: [2] }),
				m("C2", { ending: [2] }),
				m("D"),
			]),
		).toBe("A B1 B2 A C1 C2 D");
	});

	it("plays Greensleeves as printed: pickup 1, |: 2–8 [1. 9 :|] [2. 10], |: 11–18 :|", () => {
		// Numbered as the page numbers it, the pickup being bar 1.
		const bars: Measure[] = [];
		for (let bar = 1; bar <= 18; bar++) {
			const flags: Partial<Measure> = {};
			if (bar === 2 || bar === 11) flags.repeatStart = true;
			if (bar === 9) Object.assign(flags, { ending: [1], repeatEnd: true });
			if (bar === 10) flags.ending = [2];
			if (bar === 18) flags.repeatEnd = true;
			bars.push(m(String(bar), flags));
		}
		const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => String(a + k));
		expect(sounds(bars)).toBe(["1", ...range(2, 9), ...range(2, 8), "10", ...range(11, 18), ...range(11, 18)].join(" "));
	});

	it("errors on a repeat start with no matching end", () => {
		expect(playOrder([m("A", { repeatStart: true }), m("B")]).error).toMatch(/Bar 1: repeat start without a matching end/);
	});

	it("errors on nested repeats", () => {
		const { error } = playOrder([
			m("A", { repeatStart: true }),
			m("B", { repeatStart: true }),
			m("C", { repeatEnd: true }),
		]);
		expect(error).toMatch(/Bar 2: .*nested repeats are not supported/);
	});

	it("errors on an ending naming a pass its repeat does not play", () => {
		const { error } = playOrder([
			m("A", { repeatStart: true }),
			m("B", { ending: [1], repeatEnd: true, repeatTimes: 2 }),
			m("C", { ending: [3] }),
		]);
		expect(error).toMatch(/Bar 3 is never played: its ending \(3\.\)/);
	});

	it("errors on a second ending outside any repeat", () => {
		expect(playOrder([m("A"), m("B", { ending: [2] })]).error).toMatch(/Bar 2 is never played/);
	});

	it("says which bar the error is in", () => {
		expect(playOrder([m("A"), m("B", { ending: [2] })]).errorBar).toBe(1);
		expect(playOrder([m("A"), m("B", { repeatStart: true })]).errorBar).toBe(1);
		expect(playOrder([m("A", { repeatEnd: true })]).errorBar).toBeNull();
	});
});

describe("endingLabel", () => {
	it("writes the passes as printed, in order", () => {
		expect(endingLabel([1])).toBe("1.");
		expect(endingLabel([2, 1])).toBe("1.2.");
	});
});

describe("expandFingerpickPattern", () => {
	it("returns an identity map when there are no repeats", () => {
		const p = pattern([m("A"), m("B"), m("C")]);
		const { pattern: out, originMeasureIndices } = expandFingerpickPattern(p);
		expect(out.measures).toHaveLength(3);
		expect(originMeasureIndices).toEqual([0, 1, 2]);
	});

	it("expands a 2-measure repeat and maps expanded→original", () => {
		const p = pattern([m("A", { repeatStart: true }), m("B", { repeatEnd: true }), m("C")]);
		const { pattern: out, originMeasureIndices } = expandFingerpickPattern(p);
		// A B (A' B') C
		expect(out.measures).toHaveLength(5);
		expect(originMeasureIndices).toEqual([0, 1, 0, 1, 2]);
	});

	it("expands a single-measure repeat with times=3", () => {
		const p = pattern([m("A"), m("B", { repeatStart: true, repeatEnd: true, repeatTimes: 3 })]);
		const { pattern: out, originMeasureIndices } = expandFingerpickPattern(p);
		// A B B' B''
		expect(out.measures).toHaveLength(4);
		expect(originMeasureIndices).toEqual([0, 1, 1, 1]);
	});

	it("copies the spans inside a repeated range onto each pass, anchored on the copies", () => {
		const slot = (id: string): Measure["slots"][number] => ({
			id,
			duration: "quarter",
			strings: Array.from({ length: 6 }, () => ({ fret: null, muted: false })) as Measure["slots"][number]["strings"],
		});
		const p: FingerpickPattern = {
			...pattern([
				{ id: "A", slots: [slot("a1"), slot("a2")], repeatStart: true, repeatEnd: true, repeatTimes: 3 },
				{ id: "B", slots: [slot("b1")] },
			]),
			spans: [
				{ id: "pm", kind: "palmMute", from: "a1", to: "a2" },
				{ id: "lr", kind: "letRing", from: "a2", to: "b1" },
			],
		};
		const { pattern: out } = expandFingerpickPattern(p);
		expect(out.measures).toHaveLength(4);
		const palm = out.spans!.filter((s) => s.kind === "palmMute");
		expect(palm).toHaveLength(3);
		expect(palm.map((s) => [s.from, s.to])).toEqual([
			["a1", "a2"],
			[out.measures[1].slots[0].id, out.measures[1].slots[1].id],
			[out.measures[2].slots[0].id, out.measures[2].slots[1].id],
		]);
		// The let ring runs out of the range: it is not copied.
		expect(out.spans!.filter((s) => s.kind === "letRing")).toEqual([p.spans![1]]);
	});

	it("returns the pattern unexpanded on invalid markup", () => {
		const p = pattern([m("A", { repeatStart: true }), m("B")]);
		const { pattern: out, originMeasureIndices } = expandFingerpickPattern(p);
		expect(out.measures).toHaveLength(2);
		expect(originMeasureIndices).toEqual([0, 1]);
	});

	it("maps first and second endings, copying a bar on its second pass", () => {
		const p = pattern([
			m("A", { repeatStart: true }),
			m("B", { ending: [1], repeatEnd: true }),
			m("C", { ending: [2] }),
		]);
		const { pattern: out, originMeasureIndices } = expandFingerpickPattern(p);
		expect(originMeasureIndices).toEqual([0, 1, 0, 2]);
		expect(out.measures.map((x) => x.id).slice(0, 2)).toEqual(["A", "B"]);
		expect(out.measures[2].id).not.toBe("A");
		expect(out.measures[3].id).toBe("C");
	});
});

describe("mapOriginToExpandedIndex", () => {
	it("maps an original index to its first occurrence", () => {
		const originMap = [0, 1, 0, 1, 2]; // A B A' B' C
		expect(mapOriginToExpandedIndex(originMap, 0)).toBe(0);
		expect(mapOriginToExpandedIndex(originMap, 1)).toBe(1);
		expect(mapOriginToExpandedIndex(originMap, 2)).toBe(4);
	});

	it("falls back to the input index when unmapped", () => {
		expect(mapOriginToExpandedIndex([0, 1, 2], 5)).toBe(5);
	});
});

describe("voltaMarks", () => {
	it("labels a bracket at its first bar and closes every ending at its last bar, the final one too", () => {
		const marks = voltaMarks([
			m("A", { repeatStart: true }),
			m("B1", { ending: [1] }),
			m("B2", { ending: [1], repeatEnd: true }),
			m("C", { ending: [2] }),
			m("D"),
		]);
		expect(marks.has("A")).toBe(false);
		expect(marks.get("B1")).toEqual({ label: "1.", continues: true });
		expect(marks.get("B2")).toEqual({ label: null, continues: false });
		expect(marks.get("C")).toEqual({ label: "2.", continues: false });
		expect(marks.has("D")).toBe(false);
	});

	it("starts a new bracket after a repeat end even with the same passes", () => {
		const marks = voltaMarks([
			m("A", { ending: [1, 2], repeatEnd: true }),
			m("B", { ending: [2, 1] }),
		]);
		expect(marks.get("A")).toEqual({ label: "1.2.", continues: false });
		expect(marks.get("B")).toEqual({ label: "1.2.", continues: false });
	});
});

describe("impliedRepeatTimes", () => {
	it("is the highest pass across the run of ending bars, and null off an ending", () => {
		const bars = [m("A", { repeatStart: true }), m("B", { ending: [1, 2], repeatEnd: true }), m("C", { ending: [3] }), m("D")];
		expect(impliedRepeatTimes(bars, 1)).toBe(3);
		expect(impliedRepeatTimes(bars, 2)).toBe(3);
		expect(impliedRepeatTimes(bars, 0)).toBeNull();
		expect(impliedRepeatTimes(bars, 3)).toBeNull();
	});
});

describe("toggleEnding", () => {
	it("turns a pass on in order, and the last one off takes the ending away", () => {
		let bars = [m("A"), m("B")];
		bars = toggleEnding(bars, 1, 2);
		bars = toggleEnding(bars, 1, 1);
		expect(bars[1].ending).toEqual([1, 2]);
		bars = toggleEnding(bars, 1, 2);
		expect(bars[1].ending).toEqual([1]);
		bars = toggleEnding(bars, 1, 1);
		expect("ending" in bars[1]).toBe(false);
		expect(bars[0]).toBe(bars[0]);
	});

	it("drops a written count once the bar is under an ending", () => {
		const bars = toggleEnding([m("A", { repeatEnd: true, repeatTimes: 3 })], 0, 1);
		expect(bars[0]).toEqual({ id: "A", slots: [], repeatEnd: true, ending: [1] });
	});
});
