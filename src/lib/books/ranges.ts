import type { Chapter, ChapterRange } from "@/lib/books/types";

/**
 * The manual range editor's rules, the same ones the service applies on
 * `PUT /books/{id}/chapters`: every range inside the book, in page order,
 * not overlapping. Gaps are fine — pages nobody wants parsed. Checked here
 * first so the editor can point at the offending row; the service's 422 is
 * the backstop.
 */

export interface RangeProblem {
	/** Index into the ranges as given (not sorted). */
	index: number;
	message: string;
}

export function validateRanges(ranges: ChapterRange[], pageCount: number): RangeProblem[] {
	const problems: RangeProblem[] = [];
	const ordered = ranges
		.map((range, index) => ({ range, index }))
		.sort((a, b) => a.range.page_start - b.range.page_start);

	let previousEnd = 0;
	let previousTitle = "";
	for (const { range, index } of ordered) {
		const title = range.title.trim();
		if (title === "") {
			problems.push({ index, message: "Give this chapter a title." });
		}
		if (!Number.isInteger(range.page_start) || range.page_start < 1) {
			problems.push({ index, message: "Start at page 1 or later." });
			continue;
		}
		if (!Number.isInteger(range.page_end) || range.page_end < range.page_start) {
			problems.push({ index, message: "The chapter ends before it starts." });
			continue;
		}
		if (range.page_end > pageCount) {
			problems.push({ index, message: `The book ends at page ${pageCount}.` });
			continue;
		}
		if (range.page_start <= previousEnd) {
			problems.push({ index, message: `Overlaps “${previousTitle || "the chapter before"}”.` });
			continue;
		}
		previousEnd = range.page_end;
		previousTitle = title;
	}
	return problems;
}

/** The editor starts from what the scan found. */
export function rangesFromChapters(chapters: Chapter[]): ChapterRange[] {
	return chapters.map((c) => ({ title: c.title, page_start: c.page_start, page_end: c.page_end }));
}

/** `p4–10`, or `p7` for a single page. */
export function formatPages(start: number, end: number): string {
	return start === end ? `p${start}` : `p${start}–${end}`;
}
