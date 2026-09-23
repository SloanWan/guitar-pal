import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fixture from "@/lib/books/sample/sanyuetong.json";
import { BOOKS_DEMO_BOOK, BOOKS_DEMO_CHAPTER, BOOKS_DEMO_EXERCISE, booksStage } from "../booksStage";

describe("the demo book is the sample book", () => {
	const chapter = fixture.book.chapters.find((c) => c.id === BOOKS_DEMO_CHAPTER.id);
	const parse = fixture.parses[BOOKS_DEMO_CHAPTER.id as keyof typeof fixture.parses];
	const exercise = parse?.exercises.find((e) => e.id === BOOKS_DEMO_EXERCISE.id);

	it("names the fixture's book and chapter", () => {
		expect(fixture.book.title).toContain(BOOKS_DEMO_BOOK.title);
		expect(BOOKS_DEMO_BOOK.page_count).toBe(fixture.book.page_count);
		expect(chapter).toMatchObject({
			title: BOOKS_DEMO_CHAPTER.title,
			page_start: BOOKS_DEMO_CHAPTER.page_start,
			page_end: BOOKS_DEMO_CHAPTER.page_end,
		});
	});

	it("plays an exercise the parse actually read, whose crop ships with the app", () => {
		expect(exercise).toBeDefined();
		expect(exercise?.draft.name).toBe(BOOKS_DEMO_EXERCISE.name);
		expect(exercise?.page).toBe(BOOKS_DEMO_EXERCISE.page);
		expect(exercise?.draft.measures).toHaveLength(BOOKS_DEMO_EXERCISE.bars);
		expect(exercise?.draft.bpm).toBe(BOOKS_DEMO_EXERCISE.bpm);
		expect(exercise?.crop_path).toBe(BOOKS_DEMO_EXERCISE.cropPath);
		expect(existsSync(join(process.cwd(), "public", BOOKS_DEMO_EXERCISE.cropPath))).toBe(true);
	});
});

describe("booksStage", () => {
	it("scans the pages one by one, then reports the book ready", () => {
		expect(booksStage(0).book).toMatchObject({ status: "uploaded", scanned_pages: 0 });
		expect(booksStage(0).position).toBe("IDLE");
		expect(booksStage(0.17).book).toMatchObject({ status: "scanning", scanned_pages: 2 });
		expect(booksStage(0.17).position).toBe("SCANNING");
		expect(booksStage(0.28).book).toMatchObject({ status: "ready", scanned_pages: 4 });
		expect(booksStage(0.28).position).toBe("4 PAGES");
	});

	it("draws the chapter row, opens it, shows the draft, plays it bar by bar", () => {
		expect(booksStage(0.28).chapters).toEqual([]);
		expect(booksStage(0.3).chapters).toEqual([BOOKS_DEMO_CHAPTER]);
		expect(booksStage(0.3).position).toBe("1 CHAPTER");
		expect(booksStage(0.4).openId).toBeNull();
		expect(booksStage(0.5)).toMatchObject({ openId: BOOKS_DEMO_CHAPTER.id, draft: false, position: "CH 01 · PARSED" });
		expect(booksStage(0.7)).toMatchObject({ draft: true, playingMeasure: null });
		expect(booksStage(0.84)).toMatchObject({ playingMeasure: 0, position: "PLAYING · BAR 01" });
		expect(booksStage(0.93).playingMeasure).toBe(2);
		expect(booksStage(1).playingMeasure).toBe(3);
	});
});
