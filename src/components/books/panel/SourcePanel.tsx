"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { bookFileUrl } from "@/lib/books/api";
import type { BookDetail, Chapter } from "@/lib/books/types";
import ZoomableImage from "@/components/ZoomableImage";
import { Button } from "@/components/ui/button";
import SidePanel from "@/components/books/panel/SidePanel";
import { usePageImage } from "@/components/books/pageImage";

/**
 * The page a knowledge point or a draft came from, beside the book (#240, on
 * Candy #404): the page as printed, in the magnifier, with the chapter's
 * other pages a step away and the PDF itself a link. Pages are rendered by
 * the service on first sight and remembered, so stepping back to one is
 * instant (`pageImage`).
 */

export interface SourceView {
	chapterId: string;
	/** Where to open. */
	page: number;
	/** Every page the thing spans — chips, when there is more than one. */
	pages: number[];
	/** The note's or draft's name, under the title. */
	title: string;
}

export default function SourcePanel({
	book,
	chapter,
	source,
	onClose,
	onBack,
	animateOpen,
}: {
	book: BookDetail;
	/** The range the ‹ › steps stay inside. */
	chapter: Chapter;
	source: SourceView;
	onClose: () => void;
	/** Back to the draft this page was opened from. */
	onBack?: () => void;
	/** See SidePanel: false when replacing a panel already open. */
	animateOpen?: boolean;
}) {
	const [page, setPage] = useState(source.page);
	const image = usePageImage(book.id, page);

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
		<SidePanel
			eyebrow={`${chapter.title} · ${first === last ? `p.${first}` : `pages ${first}–${last}`}`}
			title={`Page ${page}`}
			meta={source.title}
			ariaLabel="Source page"
			onClose={onClose}
			onBack={onBack}
			animateOpen={animateOpen}
			testId="chapter-source-panel"
			footer={
				file ? (
					<Button variant="secondary" size="sm" asChild>
						<a href={`${file}#page=${page}`} target="_blank" rel="noreferrer">
							Open the PDF at p.{page}
							<ExternalLink aria-hidden />
						</a>
					</Button>
				) : null
			}
		>
			<div className="bk-pgnav">
				<Button
					variant="icon"
					size="sm"
					aria-label="Previous page"
					disabled={page <= first}
					onClick={() => setPage((p) => Math.max(first, p - 1))}
				>
					<ChevronLeft aria-hidden />
				</Button>
				{source.pages.length > 1 ? (
					source.pages.map((p) => (
						<button key={p} type="button" className="bk-pgc" aria-pressed={p === page} onClick={() => setPage(p)}>
							p.{p}
						</button>
					))
				) : (
					<span className="bk-meta">
						p.{page} of {first}–{last}
					</span>
				)}
				<Button
					variant="icon"
					size="sm"
					aria-label="Next page"
					disabled={page >= last}
					onClick={() => setPage((p) => Math.min(last, p + 1))}
				>
					<ChevronRight aria-hidden />
				</Button>
			</div>

			{image ? (
				<div className="bk-pgv">
					<ZoomableImage key={image} src={image} alt={`Page ${page} of ${book.title}`} title={`Page ${page}`} />
				</div>
			) : (
				<p className="bk-pgv bk-pgv-empty">
					{image === undefined ? (
						<>
							<span className="bk-spin" aria-hidden />
							Rendering page {page}…
						</>
					) : (
						`Page ${page} could not be shown.`
					)}
				</p>
			)}
			<p className="bk-meta">Pinch or scroll to zoom. Pages render the first time they’re opened.</p>
		</SidePanel>
	);
}
