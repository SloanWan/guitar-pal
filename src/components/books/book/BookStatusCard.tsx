import { TriangleAlert } from "lucide-react";
import SignInLink from "@/components/SignInLink";
import Link from "@/components/AppLink";
import { Button } from "@/components/ui/button";
import type { BookDetail } from "@/lib/books/types";

/**
 * A book with no chapters to show yet (#404): the scan running (its pages
 * counted up), the scan failed (retry, or draw the chapters by hand), or a
 * PDF that never finished uploading.
 */
export default function BookStatusCard({
	book,
	readOnly,
	onRescan,
	onDrawRanges,
}: {
	book: BookDetail;
	readOnly: boolean;
	onRescan: () => void;
	onDrawRanges: () => void;
}) {
	if (book.status === "scanning") {
		const total = book.page_count ?? 0;
		const pad = Math.max(3, String(total).length);
		const read = String(Math.min(book.scanned_pages, total || book.scanned_pages)).padStart(pad, "0");
		const of = total ? String(total).padStart(pad, "0") : "—".repeat(pad);
		return (
			<section className="bk-card bk-scanning" aria-label="Scanning">
				<p className="bk-readout" aria-label={total ? `${book.scanned_pages} of ${total} pages read` : undefined}>
					{read} / {of}
				</p>
				<div className="bk-scanning-x">
					<p className="bk-h2">{total ? "Reading pages…" : "Opening the PDF…"}</p>
					<p className="bk-meta">Chapters come after the last page. You can leave this page; it keeps going.</p>
					<span className="bk-prog" data-run={total ? undefined : ""}>
						<i style={total ? { width: `${(Math.min(book.scanned_pages, total) / total) * 100}%` } : undefined} />
					</span>
				</div>
			</section>
		);
	}
	if (book.status === "failed") {
		return (
			<section className="bk-card bk-stack" aria-label="Scan failed">
				<p className="bk-iss">
					<TriangleAlert aria-hidden data-tone="bad" />
					<span>{book.error ?? "The scan did not finish."}</span>
				</p>
				{readOnly ? null : (
					<div className="bk-row">
						<Button onClick={onRescan}>Retry the scan</Button>
						{book.page_count ? (
							<Button variant="secondary" onClick={onDrawRanges}>
								Draw chapters by hand
							</Button>
						) : null}
					</div>
				)}
			</section>
		);
	}
	return (
		<section className="bk-card bk-stack" aria-label="Waiting for upload">
			<p className="bk-lead">
				The PDF never finished uploading. Upload it again from the books page, or start the scan if it did
				arrive.
			</p>
			{readOnly ? null : (
				<div className="bk-row">
					<Button onClick={onRescan}>Start the scan</Button>
				</div>
			)}
		</section>
	);
}

/** A book that cannot be shown: not this account's (signed out), or not there at all. */
export function BookUnavailable({ unauthorized }: { unauthorized: boolean }) {
	return (
		<section className="bk-card bk-unavailable">
			<h1 className="bk-h2">{unauthorized ? "Sign in to open your books" : "Book not found"}</h1>
			<p className="bk-lead">
				{unauthorized
					? "Books stay private to the account that uploaded them. The sample book is open to everyone."
					: "It may have been deleted, or the link is not quite right."}
			</p>
			<div className="bk-row">
				{unauthorized ? (
					<Button asChild>
						<SignInLink>Sign in</SignInLink>
					</Button>
				) : null}
				<Button variant="secondary" asChild>
					<Link href="/books">Back to books</Link>
				</Button>
			</div>
		</section>
	);
}
