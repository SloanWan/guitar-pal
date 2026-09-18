/**
 * What the book service answers with (`book-service/app/books.py`), as the
 * pages read it. Kept in step by hand: the service is the source of truth.
 */

export type BookStatus = "uploaded" | "scanning" | "ready" | "failed";
export type TocSource = "outline" | "text" | "vision" | "manual";

export interface Book {
	id: string;
	title: string;
	page_count: number | null;
	storage_path: string;
	status: BookStatus;
	toc_source: TocSource | null;
	error: string | null;
	scanned_pages: number;
	created_at: string;
}

export interface Chapter {
	id: string;
	index: number;
	title: string;
	page_start: number;
	page_end: number;
	exercise_hint_count: number;
	parsed_at: string | null;
}

export interface BookDetail extends Book {
	chapters: Chapter[];
}

/** A chapter as the player draws it; what `PUT /books/{id}/chapters` takes. */
export interface ChapterRange {
	title: string;
	page_start: number;
	page_end: number;
}

/** The chapter parse (#202) caps a chapter at this many pages. */
export const MAX_PARSE_PAGES = 40;

export const TOC_SOURCE_LABEL: Record<TocSource, string> = {
	outline: "From bookmarks",
	text: "From text",
	vision: "From page images",
	manual: "Your ranges",
};
