"use client";

import Link from "@/components/AppLink";
import type { Book } from "@/lib/books/types";
import { MONO_META, Panel, STATUS_LABEL, StatusLed } from "@/components/books/bookUi";

function meta(book: Book): string {
	if (book.status === "scanning") {
		return book.page_count ? `${book.scanned_pages}/${book.page_count} P` : "Starting…";
	}
	return book.page_count ? `${book.page_count} P` : "—";
}

export default function BookList({ books }: { books: Book[] }) {
	return (
		<Panel label="Library" aside={<span className={MONO_META}>{books.length} {books.length === 1 ? "book" : "books"}</span>}>
			{books.length === 0 ? (
				<div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
					<p className={MONO_META}>{"// No books yet"}</p>
					<p className="text-[13px] text-ink-dim">
						Upload a textbook PDF and its chapters show up here. The sample below shows what a parsed
						chapter looks like.
					</p>
				</div>
			) : (
				<ul>
					{books.map((book) => (
						<li key={book.id}>
							<Link
								href={`/books/${book.id}`}
								className="flex items-center gap-3 border-b border-line border-l-2 border-l-transparent px-4 py-3 transition-colors duration-200 last:border-b-0 hover:border-l-line-strong hover:bg-sidebar-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-denim-accent"
							>
								<StatusLed status={book.status} />
								<span className="min-w-0 flex-1">
									<span className="block truncate text-[13px] font-medium text-ink">{book.title}</span>
									{book.status === "failed" && book.error ? (
										<span className="block truncate text-[11px] text-ink-dim">{book.error}</span>
									) : null}
								</span>
								<span className={`${MONO_META} flex-none tabular-nums`}>{meta(book)}</span>
								<span className={`${MONO_META} w-20 flex-none text-right ${book.status === "ready" ? "text-denim-accent" : ""}`}>
									{STATUS_LABEL[book.status]}
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}
