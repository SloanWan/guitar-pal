"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { bookFileUrl, pageImageUrl } from "@/lib/books/api";
import type { BookDetail, Chapter } from "@/lib/books/types";
import ZoomableImage from "@/components/ZoomableImage";
import SidePanel from "@/components/books/SidePanel";
import { MONO_META } from "@/components/books/bookUi";

/**
 * The page a knowledge point or a draft came from, beside the book (#240):
 * the page as printed, in the magnifier, with the chapter's other pages a
 * step away and the PDF itself a link. Pages are rendered by the service
 * on first sight and remembered, so stepping back to one is instant.
 */

export interface SourceView {
	chapterId: string;
	/** Where to open. */
	page: number;
	/** Every page the thing spans — chips, when there is more than one. */
	pages: number[];
	/** The note's or draft's name, under the header. */
	title: string;
}

// Signed URLs, one per page, kept across a remount of the panel (another
// locate, the same page): a look back costs nothing.
const urls = new Map<string, Promise<string | null>>();
function imageFor(bookId: string, page: number): Promise<string | null> {
	const key = `${bookId}:${page}`;
	let pending = urls.get(key);
	if (!pending) {
		pending = pageImageUrl(bookId, page).catch(() => null);
		urls.set(key, pending);
		// A failure is not remembered: the next look tries again.
		void pending.then((url) => {
			if (url === null) urls.delete(key);
		});
	}
	return pending;
}

const STEP =
	"flex size-7 items-center justify-center text-ink-dim transition-colors duration-(--dur-hover) hover:text-denim-accent disabled:opacity-30 disabled:hover:text-ink-dim focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:-outline-offset-2";

export default function ChapterSourcePanel({
	book,
	chapter,
	source,
	onClose,
}: {
	book: BookDetail;
	/** The range the ‹ › steps stay inside. */
	chapter: Chapter;
	source: SourceView;
	onClose: () => void;
}) {
	const [page, setPage] = useState(source.page);
	// What each page resolved to: absent while loading, null when it could not be had.
	const [images, setImages] = useState<Record<number, string | null>>({});
	const image = images[page];
	useEffect(() => {
		let cancelled = false;
		void imageFor(book.id, page).then((url) => {
			if (!cancelled) setImages((current) => ({ ...current, [page]: url }));
		});
		return () => {
			cancelled = true;
		};
	}, [book.id, page]);

	// The PDF, for the browser's own viewer; none for the sample.
	const [file, setFile] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		void bookFileUrl(book).then((url) => {
			if (!cancelled) setFile(url);
		});
		return () => {
			cancelled = true;
		};
	}, [book]);

	const first = chapter.page_start;
	const last = chapter.page_end;

	return (
		<SidePanel label={`Source · p.${page}`} ariaLabel="Source page" onClose={onClose} testId="chapter-source-panel">
			<div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2">
				<p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{source.title}</p>
				{source.pages.length > 1 ? (
					<span className="flex items-center gap-1">
						{source.pages.map((p) => (
							<button
								key={p}
								type="button"
								onClick={() => setPage(p)}
								aria-pressed={p === page}
								className={`${MONO_META} border px-1.5 py-0.5 transition-colors duration-(--dur-hover) hover:text-denim-accent aria-pressed:border-denim aria-pressed:bg-denim-tint aria-pressed:text-denim`}
							>
								p.{p}
							</button>
						))}
					</span>
				) : null}
				<span className="flex items-center gap-1">
					<button
						type="button"
						aria-label="Previous page"
						disabled={page <= first}
						onClick={() => setPage((p) => Math.max(first, p - 1))}
						className={STEP}
					>
						<ChevronLeft className="size-4" strokeWidth={1.5} />
					</button>
					<span className={`${MONO_META} tabular-nums`}>
						{first}–{last}
					</span>
					<button
						type="button"
						aria-label="Next page"
						disabled={page >= last}
						onClick={() => setPage((p) => Math.min(last, p + 1))}
						className={STEP}
					>
						<ChevronRight className="size-4" strokeWidth={1.5} />
					</button>
				</span>
			</div>

			{image ? (
				<ZoomableImage
					key={image}
					src={image}
					alt={`Page ${page} of ${book.title}`}
					title={`Page ${page}`}
					className="flex-1"
				/>
			) : (
				<div className="flex flex-1 items-center justify-center">
					{image === undefined ? (
						<span className={`${MONO_META} flex items-center gap-2`}>
							<Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
							Rendering page {page}…
						</span>
					) : (
						<span className={MONO_META}>Page {page} could not be shown.</span>
					)}
				</div>
			)}

			{file ? (
				<footer className="flex flex-none items-center border-t border-line px-4 py-2">
					<a
						href={`${file}#page=${page}`}
						target="_blank"
						rel="noreferrer"
						className={`${MONO_META} flex items-center gap-1.5 transition-colors duration-(--dur-hover) hover:text-denim-accent`}
					>
						Open the PDF at p.{page}
						<ExternalLink className="size-3" strokeWidth={1.5} aria-hidden="true" />
					</a>
				</footer>
			) : null}
		</SidePanel>
	);
}
