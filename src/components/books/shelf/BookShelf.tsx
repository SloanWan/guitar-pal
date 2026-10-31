"use client";

import "@/components/books/books.css";
import { ArrowRight, FileUp, Upload } from "lucide-react";
import Link from "@/components/AppLink";
import SignInLink from "@/components/SignInLink";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePress } from "@/components/ui/press";
import { PAGE_GUTTER } from "@/components/auth/formText";
import { BOOKS_NOT_OPEN } from "@/lib/books/api";
import { SAMPLE_BOOK_ID, SAMPLE_SHELF } from "@/lib/books/sample";
import type { Book } from "@/lib/books/types";
import BookCover from "@/components/books/shelf/BookCover";
import { useBookUpload } from "@/components/books/shelf/useBookUpload";

/** Where the library stands, as the page learned it. */
export type ShelfState = "signedOut" | "loading" | "unavailable" | "failed" | "ready";

/**
 * /books (#404): the player's books as covers on a shelf, the upload a
 * button at the top and a drop anywhere on the page, the sample in its own
 * row under them. Signed out, the upload's place asks for an account and the
 * sample stays (#262).
 */
export default function BookShelf({ state, books }: { state: ShelfState; books: Book[] }) {
	const canUpload = state === "ready" || state === "failed";
	const { busy, dragging, inputRef, choose, onInputChange } = useBookUpload(canUpload);
	return (
		<>
			<div className={`bk ${PAGE_GUTTER}`}>
				<div className="bk-wrap gp-rise">
					<header className="bk-lh">
						<div className="bk-lh-text">
							<h1 className="bk-h1">Books</h1>
							<p className="bk-lead">
								Upload a guitar method book as a PDF. Its chapters are found once, at upload; opening a
								chapter is where the exercises get read.
							</p>
						</div>
						{canUpload ? (
							<>
								<input
									ref={inputRef}
									type="file"
									accept="application/pdf,.pdf"
									className="sr-only"
									tabIndex={-1}
									aria-hidden
									onChange={onInputChange}
								/>
								<Button onClick={choose} disabled={busy !== null} className="bk-upload">
									<Upload aria-hidden />
									{busy ?? "Upload a PDF"}
								</Button>
							</>
						) : null}
					</header>

					{canUpload ? (
						<p className="bk-dropnote">
							<FileUp aria-hidden />
							<span>
								Or drop a PDF anywhere on this page · up to 100 MB · private to your account. Page text and
								short excerpts go to the model API; nothing is shared between accounts.
							</span>
						</p>
					) : state === "signedOut" ? (
						<div className="bk-note">
							<p>
								Sign in to upload your own book. Books stay private to your account; the sample below is open
								to everyone.
							</p>
							<Button asChild>
								<SignInLink>Sign in</SignInLink>
							</Button>
						</div>
					) : state === "unavailable" ? (
						<div className="bk-note">
							<p>{BOOKS_NOT_OPEN} Until it is, the sample below shows what it does.</p>
						</div>
					) : null}

					{state === "signedOut" || state === "unavailable" ? null : (
						<section className="bk-sec" aria-labelledby="bk-yours">
							<div className="bk-sec-h">
								<h2 id="bk-yours" className="bk-h2">
									Your books
								</h2>
								{state === "ready" && books.length > 0 ? (
									<span className="bk-meta">
										{books.length} {books.length === 1 ? "book" : "books"}
									</span>
								) : null}
							</div>
							{state === "loading" ? (
								<Skeleton className="bk-shelf-skeleton" />
							) : state === "failed" ? (
								<p className="bk-empty">Could not load your books. Reload the page to try again.</p>
							) : books.length === 0 ? (
								<p className="bk-empty">
									No books yet. Upload a method book and its chapters show up here; the sample below shows
									what a parsed chapter looks like.
								</p>
							) : (
								<div className="bk-shelf">
									{books.map((book, i) => (
										<BookCover key={book.id} book={book} index={i} />
									))}
								</div>
							)}
						</section>
					)}

					<section className="bk-sec" aria-labelledby="bk-sample">
						<div className="bk-sec-h">
							<h2 id="bk-sample" className="bk-h2">
								Try the sample
							</h2>
							<span className="bk-meta">Read-only · open to everyone</span>
						</div>
						<SampleCard />
					</section>
				</div>
			</div>
			{dragging ? (
				<div className="bk-drop" aria-hidden>
					<div className="bk-drop-card">
						<FileUp />
						<b>Drop the PDF to upload it</b>
						<span>Up to 100 MB · private to your account</span>
					</div>
				</div>
			) : null}
		</>
	);
}

/** The way into the sample book (#241), there whether or not the player has books. */
function SampleCard() {
	const press = usePress<HTMLAnchorElement>(undefined, { hop: true });
	return (
		<Link ref={press} href={`/books/${SAMPLE_BOOK_ID}`} className="bk-sample gp-hop">
			<span className="bk-cover">
				{/* eslint-disable-next-line @next/next/no-img-element -- a public file, small */}
				<img src={SAMPLE_SHELF.cover} alt="" />
			</span>
			<span className="bk-sample-x">
				<span className="bk-h2">
					<span className="gp-title">{SAMPLE_SHELF.title}</span>
				</span>
				<span className="bk-lead bk-lead-s">
					One parsed chapter: what it teaches, and the tab drafts it asks you to play — beside the page they
					were read from.
				</span>
				<span className="bk-meta">{SAMPLE_SHELF.meta}</span>
			</span>
			<span className="bk-sample-go">
				<span>Open</span>
				<ArrowRight aria-hidden />
			</span>
		</Link>
	);
}
