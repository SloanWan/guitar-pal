import { describe, it, expect } from "vitest";
import { bpmFaderMarks } from "../playbackConstants";

describe("bpmFaderMarks", () => {
	it("keeps the simple-meter fader as it was: 40–220 with the genre ticks", () => {
		const marks = bpmFaderMarks([4, 4]);
		expect([marks.min, marks.max]).toEqual([40, 220]);
		expect(marks.values).toEqual([60, 75, 90, 100, 110, 120, 130, 140, 160]);
		expect(marks.percents).toEqual([11, 19, 28, 33, 39, 44, 50, 56, 67]);
		expect(marks.scale).toEqual(["40", "130", "220"]);
		expect(bpmFaderMarks([3, 4])).toEqual(marks);
	});

	it("gives a compound meter its own lower range, ticks on the same track", () => {
		const marks = bpmFaderMarks([6, 8]);
		expect([marks.min, marks.max]).toEqual([40, 140]);
		expect(marks.scale).toEqual(["40", "90", "140"]);
		expect(marks.values.every((v) => v >= marks.min && v <= marks.max)).toBe(true);
		expect(marks.values).toHaveLength(marks.labels.length);
		expect(marks.values).toHaveLength(marks.percents.length);
		marks.percents.forEach((p, i) =>
			expect(p).toBe(Math.round(((marks.values[i] - 40) / 100) * 100)),
		);
		expect(bpmFaderMarks([12, 8])).toEqual(marks);
	});
});
