import { useSyncExternalStore } from "react";

/**
 * The chapter the assistant may be asked about (#203).
 *
 * The book page sets it while a parsed chapter is open on `/books/[id]` and
 * clears it when the chapter closes or the page unmounts; the assistant,
 * which lives in the topbar, reads it to offer the Book mode and to know
 * which chapter a question goes to. A store rather than a prop: nothing
 * between the page and the topbar wants to know.
 */

export interface BookAskContext {
	bookId: string;
	chapterId: string;
	bookTitle: string;
	chapterTitle: string;
}

let current: BookAskContext | null = null;
const listeners = new Set<() => void>();

export function setBookContext(next: BookAskContext | null): void {
	if (
		current === next ||
		(current !== null && next !== null && current.bookId === next.bookId && current.chapterId === next.chapterId)
	) {
		return;
	}
	current = next;
	for (const listener of listeners) listener();
}

export function readBookContext(): BookAskContext | null {
	return current;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

const none = () => null;

export function useBookContext(): BookAskContext | null {
	return useSyncExternalStore(subscribe, readBookContext, none);
}

/**
 * A page reference on an answer, clicked: the book page, if it is the one on
 * screen, opens the page beside the book. Dispatched by the panel, taken by
 * `/books/[id]`.
 */
export const BOOK_LOCATE_EVENT = "guitarpal:book-locate";

export interface BookLocateDetail {
	bookId: string;
	chapterId: string;
	page: number;
}

export function locateBookPage(detail: BookLocateDetail): void {
	window.dispatchEvent(new CustomEvent<BookLocateDetail>(BOOK_LOCATE_EVENT, { detail }));
}

/**
 * A page reference clicked anywhere but its own book's page: nothing is
 * listening yet, so it is held until `/books/[id]` mounts. The page reads it
 * as its first state (a read, so a render run twice sees it twice) and
 * clears it once mounted — whichever book mounted, so a navigation that went
 * elsewhere cannot open a stale page later.
 */
let pendingLocate: BookLocateDetail | null = null;

export function locateBookPageOnArrival(detail: BookLocateDetail): void {
	pendingLocate = detail;
}

export function pendingLocateFor(bookId: string): BookLocateDetail | null {
	return pendingLocate !== null && pendingLocate.bookId === bookId ? pendingLocate : null;
}

export function clearPendingLocate(): void {
	pendingLocate = null;
}
