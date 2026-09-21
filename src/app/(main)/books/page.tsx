"use client";

import { BOOKS_NOT_OPEN, isServiceDown, listBooks } from "@/lib/books/api";
import type { Book } from "@/lib/books/types";
import BookUpload from "@/components/books/BookUpload";
import BookList from "@/components/books/BookList";
import { usePolledResource } from "@/components/books/usePolledResource";
import { EYEBROW, MONO_META } from "@/components/books/bookUi";
import SampleBookPanel from "@/components/books/SampleBookPanel";

// Rows keep moving while any book scans; nothing to watch otherwise.
const anyScanning = (books: Book[]) => books.some((b) => b.status === "scanning");

export default function BooksPage() {
	const { value: books, error } = usePolledResource(listBooks, anyScanning);
	// No service behind the proxy: the feature is not open; the sample still is.
	const unavailable = isServiceDown(error);
	const failed = error !== null && !unavailable;

	return (
		<div className="flex-1 bg-surface">
			<div className="container mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
				<header>
					<p className={`${EYEBROW} text-denim-accent`}>{"// Books"}</p>
					<h1 className="mt-1 text-2xl font-semibold text-ink">Textbook import</h1>
					<p className="mt-2 text-sm text-ink-dim">
						Upload a guitar book as a PDF. Its chapters are found once, at upload; opening a chapter is
						where the exercises get read.
					</p>
				</header>
				{unavailable ? (
					<p className="border border-line bg-panel px-4 py-3 text-sm text-ink-dim">
						{BOOKS_NOT_OPEN} Until it is, the sample below shows what it does.
					</p>
				) : (
					<BookUpload />
				)}
				{books !== null ? (
					<BookList books={books} />
				) : failed ? (
					<p className={`${MONO_META} px-1`}>Could not load your books.</p>
				) : unavailable ? null : (
					<p className={`${MONO_META} px-1`}>Loading…</p>
				)}
				{/* Always there, service or no service: the sample needs neither. */}
				<SampleBookPanel />
			</div>
		</div>
	);
}
