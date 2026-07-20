import { describe, it, expect } from "vitest";
import type { Measure } from "@/lib/fingerpickTypes";
import { capMeasures, MAX_MEASURES } from "../capMeasures";

function makeMeasure(i: number): Measure {
	return { id: `m${i}`, slots: [] };
}

describe("capMeasures", () => {
	it("passes through when count <= MAX_MEASURES", () => {
		const ms = Array.from({ length: MAX_MEASURES }, (_, i) => makeMeasure(i));
		const { measures, truncated } = capMeasures(ms);
		expect(measures).toHaveLength(MAX_MEASURES);
		expect(truncated).toBe(false);
	});

	it("truncates to MAX_MEASURES and sets truncated=true", () => {
		const ms = Array.from({ length: MAX_MEASURES + 5 }, (_, i) => makeMeasure(i));
		const { measures, truncated } = capMeasures(ms);
		expect(measures).toHaveLength(MAX_MEASURES);
		expect(truncated).toBe(true);
		expect(measures[0].id).toBe("m0");
		expect(measures[MAX_MEASURES - 1].id).toBe(`m${MAX_MEASURES - 1}`);
	});

	it("does not mutate the input array", () => {
		const ms = Array.from({ length: MAX_MEASURES + 1 }, (_, i) => makeMeasure(i));
		capMeasures(ms);
		expect(ms).toHaveLength(MAX_MEASURES + 1);
	});

	it("MAX_MEASURES is 128", () => {
		expect(MAX_MEASURES).toBe(128);
	});
});
