import { describe, expect, it } from "vitest";
import { chapterPages, estimateParseUsd, formatUsd, formatUsdRange } from "@/lib/books/parseCost";

describe("parse cost estimate", () => {
	it("counts pages inclusively", () => {
		expect(chapterPages({ page_start: 204, page_end: 207 })).toBe(4);
		expect(chapterPages({ page_start: 3, page_end: 3 })).toBe(1);
	});

	it("brackets the calibrated numbers: prose low, a page of exercises high", () => {
		// The four-page dense-tab chapter came to $0.89; a prose chapter to a few cents.
		const range = estimateParseUsd(4);
		expect(range.low).toBeLessThan(0.1);
		expect(range.high).toBeGreaterThan(0.89);
		expect(formatUsdRange(range)).toBe("$0.05–1.00");
	});

	it("formats the recorded cost like the estimate", () => {
		expect(formatUsd(0.2728)).toBe("$0.27");
		expect(formatUsd(0)).toBe("$0.00");
	});
});
