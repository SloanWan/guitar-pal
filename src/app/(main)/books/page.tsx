"use client";

import { useCallback } from "react";
import { isServiceDown, listBooks } from "@/lib/books/api";
import type { Book } from "@/lib/books/types";
import { useUser } from "@/hooks/useUser";
import { usePolledResource } from "@/components/books/usePolledResource";
import BookShelf, { type ShelfState } from "@/components/books/shelf/BookShelf";

// Covers keep moving while any book scans; nothing to watch otherwise.
const anyScanning = (books: Book[]) => books.some((b) => b.status === "scanning");

const NO_BOOKS: Book[] = [];

export default function BooksPage() {
	// The page is open to everyone (#262); the library and the upload are the
	// signed-in half of it. Signed out, the API is not asked (it would answer
	// 401) and the sample stands in for a library.
	const { user, loading: userLoading } = useUser();
	const load = useCallback(() => (user ? listBooks() : Promise.resolve(NO_BOOKS)), [user]);
	const { value: books, error } = usePolledResource(load, anyScanning);

	const state: ShelfState =
		!userLoading && user === null
			? "signedOut"
			: isServiceDown(error)
				? "unavailable"
				: error !== null
					? "failed"
					: userLoading || books === null
						? "loading"
						: "ready";
	return <BookShelf state={state} books={books ?? NO_BOOKS} />;
}
