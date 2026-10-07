import type { Book, Chapter } from "@/lib/books/types";
import { seg } from "./progress";

/**
 * The books chapter's story, told on the sample book the /books/sample page
 * shows: the PDF is scanned page by page, its chapter appears as a row, the
 * row opens on what the parse read from it, and one exercise's draft plays
 * beside the crop it was read from.
 */

export const BOOKS_DEMO_BOOK: Book = {
	id: "sample",
	title: "吉他自学三月通",
	page_count: 4,
	storage_path: "",
	status: "ready",
	toc_source: "text",
	error: null,
	scanned_pages: 4,
	created_at: "2026-09-20T00:00:00.000Z",
};

/** The sample book's one chapter, as the fixture has it (a test keeps them in step). */
export const BOOKS_DEMO_CHAPTER: Chapter = {
	id: "c51f5c80-3d4e-4986-9956-b10cb9627801",
	index: 0,
	title: "第三篇 实际操练",
	page_start: 1,
	page_end: 4,
	exercise_hint_count: 4,
	parsed_at: "2026-09-20T00:00:00.000Z",
	parse_status: "ready",
	parse_error: null,
	parse_cost: { input_tokens: 0, output_tokens: 0, usd: 0 },
	parse_warnings: [],
};

/** The exercise the story plays: "⑤弦:A-B-C", four bars read from page 3. */
export const BOOKS_DEMO_EXERCISE = {
	id: "47c3aba0-700a-4c62-9ae2-44584d18469e",
	name: "⑤弦:A-B-C",
	page: 3,
	bars: 4,
	bpm: 120,
	cropPath: "/samples/sanyuetong/p0003-1.png",
} as const;

const PHASE = { scan: [0.06, 0.28], rowsAt: 0.3, openAt: 0.5, draftAt: 0.66, play: [0.84, 1] } as const;

export interface BooksStage {
	/** The book as the scan has it so far. */
	book: Book;
	/** The chapter rows, once the scan has drawn them. */
	chapters: Chapter[];
	/** The open row's chapter id. */
	openId: string | null;
	/** The exercise's draft is on screen. */
	draft: boolean;
	/** The bar the draft is playing, or null at rest. */
	playingMeasure: number | null;
	position: string;
}

export function booksStage(p: number): BooksStage {
	const total = BOOKS_DEMO_BOOK.page_count ?? 0;
	const scanShare = seg(p, ...PHASE.scan);
	const scanned = Math.round(scanShare * total);
	const started = p >= PHASE.scan[0];
	const book: Book = {
		...BOOKS_DEMO_BOOK,
		scanned_pages: scanned,
		status: !started ? "uploaded" : scanShare < 1 ? "scanning" : "ready",
	};
	const chapters = p >= PHASE.rowsAt ? [BOOKS_DEMO_CHAPTER] : [];
	const openId = p >= PHASE.openAt ? BOOKS_DEMO_CHAPTER.id : null;
	const draft = p >= PHASE.draftAt;
	const playing = p >= PHASE.play[0];
	const playingMeasure = playing
		? Math.min(BOOKS_DEMO_EXERCISE.bars - 1, Math.floor(seg(p, ...PHASE.play) * BOOKS_DEMO_EXERCISE.bars + 1e-9))
		: null;
	return {
		book,
		chapters,
		openId,
		draft,
		playingMeasure,
		position:
			playingMeasure !== null
				? `PLAYING · BAR ${String(playingMeasure + 1).padStart(2, "0")}`
				: openId
					? "CH 01 · PARSED"
					: chapters.length
						? `${chapters.length} CHAPTER`
						: book.status === "scanning"
							? "SCANNING"
							: book.status === "ready"
								? `${total} PAGES`
								: "IDLE",
	};
}
