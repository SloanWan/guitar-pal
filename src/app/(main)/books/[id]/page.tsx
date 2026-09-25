"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { toast } from "sonner";
import Link from "@/components/AppLink";
import SignInLink from "@/components/SignInLink";
import {
	BOOKS_NOT_OPEN,
	BookApiError,
	deleteBook,
	getBook,
	isServiceDown,
	renameBook,
	replaceChapters,
	scanBook,
} from "@/lib/books/api";
import type { BookDetail, Chapter, ChapterRange } from "@/lib/books/types";
import { TOC_SOURCE_LABEL } from "@/lib/books/types";
import { rangesFromChapters } from "@/lib/books/ranges";
import { isSampleBook } from "@/lib/books/sample";
import { BOOK_LOCATE_EVENT, setBookContext, type BookLocateDetail } from "@/lib/assistant/bookContext";
import { usePolledResource } from "@/components/books/usePolledResource";
import ScanReadout from "@/components/books/ScanReadout";
import ChapterList from "@/components/books/ChapterList";
import ChapterCard from "@/components/books/ChapterCard";
import ChapterDraftPanel, { type OpenDraft } from "@/components/books/ChapterDraftPanel";
import ChapterSourcePanel, { type SourceView } from "@/components/books/ChapterSourcePanel";
import ChapterTextTabPanel from "@/components/books/ChapterTextTabPanel";
import { CropDialog, CropInspector, type CropView } from "@/components/books/CropViewer";
import ChapterRangeEditor from "@/components/books/ChapterRangeEditor";
import DeleteBookDialog from "@/components/books/DeleteBookDialog";
import {
	DangerButton,
	DENIM_BUTTON,
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
	// Signed out, the API answers 401 for any book but the sample (#262).
	const unauthorized = error instanceof BookApiError && error.status === 401;
	// The sample book (#241): the same page, with nothing that would change it.
	const readOnly = isSampleBook(id);
	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [openChapter, setOpenChapter] = useState<string | null>(null);
	// What is open beside the book — a draft to play (#233), a page to read
	// (#240) or a text tab to read by ear (#228); one at a time.
	// `entered` says whether the panel opened from nothing (it grows into
	// place) or replaced one already open (it just changes what it shows).
	type Side =
		| { kind: "draft"; draft: OpenDraft; entered: boolean }
		| { kind: "source"; source: SourceView; entered: boolean }
		| { kind: "textTab"; page: number; entered: boolean };
	const [side, setSide] = useState<Side | null>(null);
	const openDraft = (draft: OpenDraft) =>
		setSide((current) => ({ kind: "draft", draft, entered: current === null }));
	const locate = (source: SourceView) =>
		setSide((current) => ({ kind: "source", source, entered: current === null }));
	const readTextTab = (page: number) =>
		setSide((current) => ({ kind: "textTab", page, entered: current === null }));

	// The open, parsed chapter is what the assistant's Book mode asks (#203);
	// the sample has no service behind it, so it offers nothing. Cleared when
	// the chapter closes and when the page goes.
	const openRow = book?.chapters.find((c) => c.id === openChapter) ?? null;
	const askable = !readOnly && book !== null && openRow !== null && openRow.parse_status === "ready";
	const bookTitle = book?.title ?? "";
	const chapterTitle = openRow?.title ?? "";
	useEffect(() => {
		setBookContext(askable ? { bookId: id, chapterId: openChapter!, bookTitle, chapterTitle } : null);
	}, [askable, id, openChapter, bookTitle, chapterTitle]);
	useEffect(() => () => setBookContext(null), []);
	// A page an answer cited, clicked in the panel: open it beside the book.
	useEffect(() => {
		function onLocate(event: Event) {
			const { detail } = event as CustomEvent<BookLocateDetail>;
			if (detail.bookId !== id) return;
			locate({ chapterId: detail.chapterId, page: detail.page, pages: [detail.page], title: `p.${detail.page}` });
		}
		window.addEventListener(BOOK_LOCATE_EVENT, onLocate);
		return () => window.removeEventListener(BOOK_LOCATE_EVENT, onLocate);
	}, [id]);
	// A crop at full size: a dialog on its own, or over the book's column while
	// the panel is open (see CropViewer). Closing the panel closes it too.
	const [crop, setCrop] = useState<CropView | null>(null);
	function closeSide() {
		setSide(null);
		setCrop(null);
	}

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

	if (missing || unauthorized) {
		return (
			<div className="flex-1 bg-surface">
				<div className="container mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-16 text-center">
					<p className={MONO_META}>{unauthorized ? "// Sign in to open your books" : "// Book not found"}</p>
					{unauthorized ? (
						<p className="max-w-md text-sm text-ink-dim">
							Books stay private to the account that uploaded them. The sample book is open to everyone.
						</p>
					) : null}
					<div className="flex items-center gap-4">
						{unauthorized ? <SignInLink className={DENIM_BUTTON} /> : null}
						<Link href="/books" className="text-sm text-ink-dim underline hover:text-ink">
							Back to books
						</Link>
					</div>
				</div>
			</div>
		);
	}

	// With a draft open the page splits at lg: the book keeps the left column
	// (its own scroll) and the panel takes the right half, full height. Below
	// lg the panel is a sheet over the page instead.
	return (
		<div className="flex-1 bg-surface lg:flex lg:h-full">
			<div className="relative min-w-0 flex-1 lg:flex lg:flex-col">
			<div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
			<div className="container mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
				<Link href="/books" className={`${MONO_META} inline-flex items-center gap-1.5 hover:text-ink`}>
					<ArrowLeft className="size-3.5" strokeWidth={1.5} strokeLinecap="square" aria-hidden="true" />
					Books
				</Link>

				{book === null ? (
					<p className={MONO_META}>
						{isServiceDown(error) ? BOOKS_NOT_OPEN : error ? "Could not load the book." : "Loading…"}
					</p>
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
									{readOnly ? null : (
										<button
											type="button"
											aria-label="Rename book"
											onClick={rename}
											className="flex size-7 flex-none items-center justify-center text-ink-faint transition-colors hover:text-denim-accent"
										>
											<Pencil className="size-3.5" strokeWidth={1.5} strokeLinecap="square" />
										</button>
									)}
								</h1>
								<p className={`${MONO_META} mt-2`}>{readOnly ? `Sample · ${bookMeta(book)}` : bookMeta(book)}</p>
							</div>
							{readOnly ? null : (
								<div className="flex flex-none gap-2">
									{book.status === "ready" || book.status === "failed" ? (
										<GhostButton onClick={rescan}>Rescan</GhostButton>
									) : null}
									<DangerButton onClick={() => setConfirmDelete(true)}>Delete</DangerButton>
								</div>
							)}
						</header>

						{readOnly ? (
							<div className="border border-denim-border bg-denim-tint px-4 py-3 text-sm leading-relaxed text-ink">
								<p className={`${EYEBROW} mb-1 text-denim-accent`}>{"// How this page works"}</p>
								<p>
									This is one chapter of a real method book, read once by the import: what it teaches
									as knowledge points, and what it asks you to play as practice drafts. Open the chapter,
									press <span className="font-medium">Open</span> on a draft to play it beside the book,
									click its thumbnail to see the page it was read from, edit it, and take it to the
									fingerpick page. Upload your own PDF on the books page to do the same with any chapter.
								</p>
							</div>
						) : null}

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
									editing || readOnly ? null : (
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
											<ChapterCard
												bookId={book.id}
												chapter={chapter}
												onChapter={updateChapter}
												onOpenDraft={openDraft}
												onViewCrop={setCrop}
												onLocate={locate}
												onReadTextTab={readOnly ? undefined : readTextTab}
												readOnly={readOnly}
											/>
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
			{side && crop ? <CropInspector crop={crop} onClose={() => setCrop(null)} /> : null}
			</div>
			{side ? null : <CropDialog crop={crop} onClose={() => setCrop(null)} />}
			{/* Keyed on what is shown: another draft or another locate is a fresh panel, not a swap. */}
			{side?.kind === "draft" && book ? (
				<ChapterDraftPanel
					key={side.draft.exercise.id}
					bookId={book.id}
					draft={side.draft}
					animateOpen={side.entered}
					onClose={closeSide}
					onLocate={() =>
						locate({
							chapterId: side.draft.chapterId,
							page: side.draft.exercise.page,
							pages: [side.draft.exercise.page],
							title: side.draft.pattern.name,
						})
					}
				/>
			) : null}
			{side?.kind === "textTab" && book ? (
				<ChapterTextTabPanel
					key={`text-tab:${side.page}`}
					book={book}
					page={side.page}
					animateOpen={side.entered}
					onClose={closeSide}
				/>
			) : null}
			{side?.kind === "source" && book
				? (() => {
						const chapter = book.chapters.find((c) => c.id === side.source.chapterId);
						return chapter ? (
							<ChapterSourcePanel
								key={`${chapter.id}:${side.source.title}:${side.source.page}`}
								book={book}
								chapter={chapter}
								source={side.source}
								animateOpen={side.entered}
								onClose={closeSide}
							/>
						) : null;
					})()
				: null}
		</div>
	);
}
