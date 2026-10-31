"use client";

import type { CSSProperties } from "react";
import { Check, Clock, TriangleAlert } from "lucide-react";
import Link from "@/components/AppLink";
import { usePress } from "@/components/ui/press";
import type { Book } from "@/lib/books/types";
import { coverStatus, hasCoverPage, scanProgress, shelfMeta } from "@/lib/books/shelf";
import { usePageImage } from "@/components/books/pageImage";

/**
 * One book on the shelf (#404): its first page as the cover (#405), a plain
 * card with the title until the scan has that page; the scan's progress laid
 * over the cover while it runs; a failed scan dimmed, with its reason. Covers
 * bounce onto the shelf in turn (`index`).
 */
export default function BookCover({ book, index }: { book: Book; index: number }) {
	const press = usePress<HTMLAnchorElement>(undefined, { hop: true });
	const cover = usePageImage(hasCoverPage(book) ? book.id : null, 1);
	const status = coverStatus(book);
	const progress = scanProgress(book);
	return (
		<Link
			ref={press}
			href={`/books/${book.id}`}
			className="bk-book"
			style={{ "--i": index } as CSSProperties}
			aria-label={`${book.title} — ${status.label}`}
		>
			<span className="bk-cover" data-dim={book.status === "failed" ? "" : undefined}>
				{cover ? (
					// A signed, hour-long Storage URL: not a candidate for next/image's loader.
					// eslint-disable-next-line @next/next/no-img-element
					<img src={cover} alt="" />
				) : (
					<span className="bk-cover-blank" aria-hidden>
						{book.title}
					</span>
				)}
				{progress ? (
					<span className="bk-scan">
						<b>{progress.label}</b>
						<span>{progress.fraction === null ? "Opening the PDF" : "pages read"}</span>
						<span className="bk-prog" data-run={progress.fraction === null ? "" : undefined}>
							<i style={progress.fraction === null ? undefined : { width: `${progress.fraction * 100}%` }} />
						</span>
					</span>
				) : null}
			</span>
			<span className="bk-book-x">
				<span className="bk-book-t">
					<span className="gp-title">{book.title}</span>
				</span>
				<span className="bk-meta">{shelfMeta(book)}</span>
				<span className="bk-st" data-tone={status.tone}>
					<StatusGlyph tone={status.tone} />
					{status.label}
				</span>
				{book.status === "failed" && book.error ? <span className="bk-meta bk-clamp">{book.error}</span> : null}
			</span>
		</Link>
	);
}

export function StatusGlyph({ tone }: { tone: ReturnType<typeof coverStatus>["tone"] }) {
	if (tone === "run") return <span className="bk-spin" aria-hidden />;
	const Icon = tone === "ok" ? Check : tone === "bad" ? TriangleAlert : Clock;
	return <Icon aria-hidden strokeWidth={2} />;
}
