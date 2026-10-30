import type { Book } from "@/lib/books/types";

/**
 * What a book's cover on the shelf says (#404): one status word with its tone,
 * the line under the title, the scan's progress while it runs, and whether
 * the first page can stand in as the cover yet (#405).
 */

export type CoverTone = "ok" | "run" | "bad" | "idle";

export interface CoverStatus {
	label: string;
	tone: CoverTone;
}

export function coverStatus(book: Pick<Book, "status">): CoverStatus {
	switch (book.status) {
		case "ready":
			return { label: "Ready", tone: "ok" };
		case "scanning":
			return { label: "Scanning", tone: "run" };
		case "failed":
			return { label: "Scan failed", tone: "bad" };
		case "uploaded":
			return { label: "Waiting for upload", tone: "idle" };
	}
}

/** The line under the title: the page count, or where the scan is. */
export function shelfMeta(book: Pick<Book, "status" | "page_count">): string {
	if (book.page_count) return `${book.page_count} ${book.page_count === 1 ? "page" : "pages"}`;
	return book.status === "scanning" ? "Opening the PDF…" : "No pages yet";
}

export interface ScanProgress {
	/** "64 / 180", or "—" before the page count is known. */
	label: string;
	/** 0–1, or null while the count is unknown (the bar runs instead). */
	fraction: number | null;
}

/** The scan as the cover shows it; null for a book not scanning. */
export function scanProgress(book: Pick<Book, "status" | "page_count" | "scanned_pages">): ScanProgress | null {
	if (book.status !== "scanning") return null;
	if (!book.page_count) return { label: "—", fraction: null };
	const read = Math.min(book.scanned_pages, book.page_count);
	return { label: `${read} / ${book.page_count}`, fraction: read / book.page_count };
}

/**
 * Whether page 1 can be asked for: the PDF arrived and the scan got past its
 * first page (or finished, or failed after counting the pages).
 */
export function hasCoverPage(book: Pick<Book, "status" | "page_count" | "scanned_pages">): boolean {
	if (!book.page_count) return false;
	if (book.status === "ready" || book.status === "failed") return true;
	return book.status === "scanning" && book.scanned_pages > 0;
}
