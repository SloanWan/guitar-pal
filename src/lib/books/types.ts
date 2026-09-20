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

export type ParseStatus = "idle" | "parsing" | "ready" | "failed";

export interface ParseCost {
	input_tokens: number;
	output_tokens: number;
	usd: number;
}

/** The validator's shape for anything a draft could not carry over (#114). */
export interface ParseIssue {
	code: string;
	path: string;
	message: string;
}

export interface Chapter {
	id: string;
	index: number;
	title: string;
	page_start: number;
	page_end: number;
	exercise_hint_count: number;
	parsed_at: string | null;
	parse_status: ParseStatus;
	parse_error: string | null;
	parse_cost: ParseCost;
	/** Drafts dropped after repair, pages skipped: shown inline on the card. */
	parse_warnings: ParseIssue[];
}

/** A knowledge point: what the chapter explains, in the book's own terms. */
export interface ChapterNote {
	id: string;
	title: string;
	body: string;
	pages: number[];
	draft_ids: string[];
}

export type ExerciseKind = "strum" | "progression" | "tab" | "chord_diagram";
export type ExerciseSource = "literal" | "derived";
export type ExerciseStatus = "proposed" | "taken" | "dismissed";

/**
 * A practice draft the parse read off a page. `draft` is already in the
 * editor's shape — for a tab, the validated `FingerpickPattern` — so opening
 * it is a handoff, not another read.
 */
export interface ChapterExercise {
	id: string;
	page: number;
	kind: ExerciseKind;
	source: ExerciseSource;
	draft: Record<string, unknown>;
	warnings: ParseIssue[];
	/** Storage path of the crop the reader saw; null when it could not be kept. */
	crop_path: string | null;
	status: ExerciseStatus;
}

/** `GET /books/{id}/pages/{page}/text`: a page's text as the scan read it (#228). */
export interface PageText {
	page: number;
	text: string;
	text_source: "layer" | "ocr" | "none";
}

/**
 * The parse's warning for a page it left to the player: its tab was in the
 * text layer, which carries no rhythm, so the card offers it to read by ear.
 */
export const TEXT_TAB_SKIPPED = "TEXT_TAB_SKIPPED";

/** The page a skipped-page warning is about, from its `path` ("page 12"). */
export function issuePage(issue: ParseIssue): number | null {
	const m = /^page (\d+)$/.exec(issue.path);
	return m ? Number(m[1]) : null;
}

/** One turn of a chapter thread, as `POST …/ask` takes it. */
export interface AskMessage {
	role: "user" | "assistant";
	content: string;
}

/**
 * `POST /books/{id}/chapters/{chapter_id}/ask` (#203). `source: "book"` is
 * answered from the chapter with the pages its citations named; `general`
 * is not the book's — general knowledge, or a decline — and cites nothing.
 * `draft` is an exercise the parse already extracted, when one was asked for.
 */
export interface AskResponse {
	message: string;
	source: "book" | "general";
	pages: number[];
	draft: ChapterExercise | null;
	model: string;
	cost: ParseCost;
	strategy: string;
}

/** `GET /books/{id}/chapters/{chapter_id}/parse`: the chapter card. */
export interface ChapterParse {
	chapter: Chapter;
	notes: ChapterNote[];
	exercises: ChapterExercise[];
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
