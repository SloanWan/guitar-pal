import { describe, it, expect, beforeEach } from "vitest";
import {
	BOOK_LOCATE_EVENT,
	locateBookPage,
	readBookContext,
	setBookContext,
	type BookLocateDetail,
} from "../bookContext";

/**
 * The store the book page writes and the assistant reads (#203): one
 * context at a time, listeners told only when the chapter actually changes.
 */

const A = { bookId: "b1", chapterId: "c1", bookTitle: "三月通", chapterTitle: "实际操练" };

describe("bookContext", () => {
	beforeEach(() => setBookContext(null));

	it("holds the open chapter and clears it", () => {
		expect(readBookContext()).toBeNull();
		setBookContext(A);
		expect(readBookContext()).toEqual(A);
		setBookContext(null);
		expect(readBookContext()).toBeNull();
	});

	it("carries a page reference to the book page as an event", () => {
		const seen: BookLocateDetail[] = [];
		const listener = (e: Event) => seen.push((e as CustomEvent<BookLocateDetail>).detail);
		window.addEventListener(BOOK_LOCATE_EVENT, listener);
		locateBookPage({ bookId: "b1", chapterId: "c1", page: 206 });
		window.removeEventListener(BOOK_LOCATE_EVENT, listener);
		expect(seen).toEqual([{ bookId: "b1", chapterId: "c1", page: 206 }]);
	});

	it("keeps the same chapter as it was — a re-render with the same ids changes nothing", () => {
		setBookContext(A);
		const before = readBookContext();
		setBookContext({ ...A, bookTitle: "renamed" });
		expect(readBookContext()).toBe(before);
		setBookContext({ ...A, chapterId: "c2" });
		expect(readBookContext()?.chapterId).toBe("c2");
	});
});
