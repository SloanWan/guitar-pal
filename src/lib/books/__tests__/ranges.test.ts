import { describe, it, expect } from "vitest";
import { formatPages, rangesFromChapters, validateRanges } from "@/lib/books/ranges";
import type { Chapter } from "@/lib/books/types";

const range = (title: string, page_start: number, page_end: number) => ({ title, page_start, page_end });

describe("validateRanges", () => {
	it("accepts ordered ranges with gaps", () => {
		expect(validateRanges([range("Two", 6, 9), range("One", 1, 3)], 12)).toEqual([]);
	});

	it("names the offending row for each rule", () => {
		expect(validateRanges([range("", 1, 3)], 12)).toEqual([
			{ index: 0, message: "Give this chapter a title." },
		]);
		expect(validateRanges([range("Zero", 0, 3)], 12)).toEqual([
			{ index: 0, message: "Start at page 1 or later." },
		]);
		expect(validateRanges([range("Back", 5, 4)], 12)).toEqual([
			{ index: 0, message: "The chapter ends before it starts." },
		]);
		expect(validateRanges([range("Long", 1, 13)], 12)).toEqual([
			{ index: 0, message: "The book ends at page 12." },
		]);
	});

	it("reports an overlap on the later range, by the earlier one's title", () => {
		const problems = validateRanges([range("B", 5, 8), range("A", 1, 5)], 12);
		expect(problems).toEqual([{ index: 0, message: "Overlaps “A”." }]);
	});

	it("treats a non-integer page as invalid", () => {
		expect(validateRanges([range("Half", 1.5, 3)], 12)).toHaveLength(1);
		expect(validateRanges([range("NaN", Number.NaN, 3)], 12)).toHaveLength(1);
	});
});

describe("helpers", () => {
	it("formats page spans", () => {
		expect(formatPages(4, 10)).toBe("p4–10");
		expect(formatPages(7, 7)).toBe("p7");
	});

	it("seeds the editor from the scan's chapters", () => {
		const chapters: Chapter[] = [
			{ id: "1", index: 0, title: "One", page_start: 1, page_end: 3, exercise_hint_count: 0, parsed_at: null },
		];
		expect(rangesFromChapters(chapters)).toEqual([range("One", 1, 3)]);
	});
});
