import { describe, it, expect } from "vitest";
import { bookInFlight, type BookDetail, type Chapter } from "@/lib/books/types";

const chapter = (parse_status: Chapter["parse_status"]): Chapter => ({
	id: `c-${parse_status}`,
	index: 0,
	title: "One",
	page_start: 1,
	page_end: 4,
	exercise_hint_count: 0,
	parsed_at: null,
	parse_status,
	parse_error: null,
	parse_cost: { input_tokens: 0, output_tokens: 0, usd: 0 },
	parse_warnings: [],
});

const book = (status: BookDetail["status"], chapters: Chapter[]): BookDetail =>
	({ id: "b1", title: "A book", status, chapters }) as BookDetail;

describe("bookInFlight", () => {
	it("follows a scan", () => {
		expect(bookInFlight(book("scanning", []))).toBe(true);
	});

	it("follows a chapter's parse, so a closed chapter's row sees it finish or fail", () => {
		expect(bookInFlight(book("ready", [chapter("ready"), chapter("parsing")]))).toBe(true);
	});

	it("rests when nothing runs", () => {
		expect(bookInFlight(book("ready", [chapter("idle"), chapter("ready"), chapter("failed")]))).toBe(false);
	});
});
