"use client";

import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { toast } from "sonner";
import Link from "@/components/AppLink";
import {
	BookApiError,
	deleteBook,
	getBook,
	renameBook,
	replaceChapters,
	scanBook,
} from "@/lib/books/api";
import type { BookDetail, Chapter, ChapterRange } from "@/lib/books/types";
import { TOC_SOURCE_LABEL } from "@/lib/books/types";
import { rangesFromChapters } from "@/lib/books/ranges";
import { usePolledResource } from "@/components/books/usePolledResource";
import ScanReadout from "@/components/books/ScanReadout";
import ChapterList from "@/components/books/ChapterList";
import ChapterCard from "@/components/books/ChapterCard";
import ChapterRangeEditor from "@/components/books/ChapterRangeEditor";
import DeleteBookDialog from "@/components/books/DeleteBookDialog";
import {
	DangerButton,
	DenimButton,
	EYEBROW,
	GhostButton,
	MONO_META,
	Panel,
	STATUS_LABEL,
	StatusLed,
} from "@/components/books/bookUi";

const isScanning = (book: BookDetail) => book.status === "scanning";

function bookMeta(book: BookDetail): string {
	const parts: string[] = [];
	if (book.page_count) parts.push(`${book.page_count} pages`);
	if (book.toc_source) parts.push(`Chapters · ${TOC_SOURCE_LABEL[book.toc_source]}`);
	parts.push(`Uploaded ${new Date(book.created_at).toLocaleDateString()}`);
	return parts.join(" · ");
}

export default function BookPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = use(params);
	const router = useRouter();
	const load = useCallback(() => getBook(id), [id]);
	const { value: book, error, refresh, set: setBook } = usePolledResource(load, isScanning);
	const missing = error instanceof BookApiError && error.status === 404;
	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [openChapter, setOpenChapter] = useState<string | null>(null);

	// The card polls its own chapter; the row learns the state from it.
	const updateChapter = useCallback(
		(chapter: Chapter) =>
			setBook((current) =>
				current
					? { ...current, chapters: current.chapters.map((c) => (c.id === chapter.id ? chapter : c)) }
					: current,
			),
		[setBook],
	);

	async function rename() {
		if (!book) return;
		const title = window.prompt("Book title", book.title)?.trim();
		if (!title || title === book.title) return;
		try {
			const updated = await renameBook(book.id, title);
			setBook({ ...book, ...updated });
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not rename the book.");
		}
	}

	async function rescan() {
		if (!book) return;
		try {
			const updated = await scanBook(book.id);
			setBook({ ...book, ...updated, chapters: [] });
			void refresh();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not start the scan.");
		}
	}

	async function save(ranges: ChapterRange[]) {
		if (!book) return;
		setSaving(true);
		setSaveError(null);
		try {
			setBook(await replaceChapters(book.id, ranges));
			setEditing(false);
			toast("Chapter ranges saved.");
		} catch (e) {
			setSaveError(e instanceof Error ? e.message : "Could not save the ranges.");
		} finally {
			setSaving(false);
		}
	}

	async function remove() {
		if (!book) return;
		setDeleting(true);
		try {
			await deleteBook(book.id);
			toast("Book deleted.");
			router.push("/books");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not delete the book.");
			setDeleting(false);
		}
	}

	if (missing) {
		return (
			<div className="flex-1 bg-surface">
				<div className="container mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-16 text-center">
					<p className={MONO_META}>{"// Book not found"}</p>
					<Link href="/books" className="text-sm text-ink-dim underline hover:text-ink">
						Back to books
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 bg-surface">
			<div className="container mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
				<Link href="/books" className={`${MONO_META} inline-flex items-center gap-1.5 hover:text-ink`}>
					<ArrowLeft className="size-3.5" strokeWidth={1.5} strokeLinecap="square" aria-hidden="true" />
					Books
				</Link>

				{book === null ? (
					<p className={MONO_META}>{error ? "Could not load the book." : "Loading…"}</p>
				) : (
					<>
						<header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div className="min-w-0">
								<p className={`${EYEBROW} flex items-center gap-2 text-denim-accent`}>
									<StatusLed status={book.status} />
									{STATUS_LABEL[book.status]}
								</p>
								<h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-ink">
									<span className="truncate">{book.title}</span>
									<button
										type="button"
										aria-label="Rename book"
										onClick={rename}
										className="flex size-7 flex-none items-center justify-center text-ink-faint transition-colors hover:text-denim-accent"
									>
										<Pencil className="size-3.5" strokeWidth={1.5} strokeLinecap="square" />
									</button>
								</h1>
								<p className={`${MONO_META} mt-2`}>{bookMeta(book)}</p>
							</div>
							<div className="flex flex-none gap-2">
								{book.status === "ready" || book.status === "failed" ? (
									<GhostButton onClick={rescan}>Rescan</GhostButton>
								) : null}
								<DangerButton onClick={() => setConfirmDelete(true)}>Delete</DangerButton>
							</div>
						</header>

						{book.status === "scanning" ? (
							<ScanReadout book={book} />
						) : book.status === "failed" ? (
							<Panel label="Scan failed" aside={<StatusLed status="failed" />}>
								<div className="flex flex-col items-start gap-4 px-4 py-6">
									<p className="text-sm text-ink">{book.error ?? "The scan did not finish."}</p>
									<div className="flex gap-2">
										<DenimButton onClick={rescan}>Retry the scan</DenimButton>
										{book.page_count ? (
											<GhostButton onClick={() => setEditing(true)}>Draw ranges by hand</GhostButton>
										) : null}
									</div>
								</div>
								{editing && book.page_count ? (
									<ChapterRangeEditor
										initial={rangesFromChapters(book.chapters)}
										pageCount={book.page_count}
										saving={saving}
										serverError={saveError}
										onSave={save}
										onCancel={() => setEditing(false)}
									/>
								) : null}
							</Panel>
						) : book.status === "uploaded" ? (
							<Panel label="Waiting for upload">
								<div className="flex flex-col items-start gap-4 px-4 py-6">
									<p className="text-sm text-ink-dim">
										The PDF never finished uploading. Upload it again from the books page, or start the
										scan if it did arrive.
									</p>
									<DenimButton onClick={rescan}>Start the scan</DenimButton>
								</div>
							</Panel>
						) : (
							<Panel
								label={editing ? "Chapters · editing" : "Chapters"}
								aside={
									editing ? null : (
										<GhostButton onClick={() => setEditing(true)} className="h-7">
											Edit ranges
										</GhostButton>
									)
								}
							>
								{editing && book.page_count ? (
									<ChapterRangeEditor
										initial={rangesFromChapters(book.chapters)}
										pageCount={book.page_count}
										saving={saving}
										serverError={saveError}
										onSave={save}
										onCancel={() => {
											setEditing(false);
											setSaveError(null);
										}}
									/>
								) : (
									<ChapterList
										chapters={book.chapters}
										openId={openChapter}
										onOpen={setOpenChapter}
										renderCard={(chapter) => (
											<ChapterCard bookId={book.id} chapter={chapter} onChapter={updateChapter} />
										)}
									/>
								)}
							</Panel>
						)}

						<DeleteBookDialog
							open={confirmDelete}
							title={book.title}
							busy={deleting}
							onConfirm={remove}
							onClose={() => setConfirmDelete(false)}
						/>
					</>
				)}
			</div>
		</div>
	);
}
