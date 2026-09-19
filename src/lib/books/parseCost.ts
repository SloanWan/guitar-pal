import type { Chapter } from "@/lib/books/types";

/**
 * What a parse is likely to cost, before the button is pressed. The numbers
 * are book-service/docs/calibration.md §5–§6: classification and knowledge
 * points come to about a cent a page; a page of tab exercises about $0.22
 * on top, since every exercise on it is read in its own call. A chapter's
 * pages are unknown until they are classified, so the estimate is a range —
 * prose at the low end, nothing but exercises at the high end.
 */

export const PARSE_USD_PER_PAGE_LOW = 0.012;
export const PARSE_USD_PER_PAGE_HIGH = 0.25;

export function chapterPages(chapter: Pick<Chapter, "page_start" | "page_end">): number {
	return chapter.page_end - chapter.page_start + 1;
}

export function estimateParseUsd(pages: number): { low: number; high: number } {
	return { low: pages * PARSE_USD_PER_PAGE_LOW, high: pages * PARSE_USD_PER_PAGE_HIGH };
}

/** "$0.05–1.00" — two decimals, the way the recorded cost is shown. */
export function formatUsdRange(range: { low: number; high: number }): string {
	return `$${range.low.toFixed(2)}–${range.high.toFixed(2)}`;
}

export function formatUsd(usd: number): string {
	return `$${usd.toFixed(2)}`;
}
