"use client";

import "@/components/books/books.css";
import { use, useEffect, useState } from "react";
import { BOOKS_NOT_OPEN, isServiceDown } from "@/lib/books/api";
import { rangesFromChapters } from "@/lib/books/ranges";
import { setBookContext } from "@/lib/assistant/bookContext";
import { useRecordVisit } from "@/hooks/useRecordVisit";
import { useUser } from "@/hooks/useUser";
import { Skeleton } from "@/components/ui/skeleton";
import { PAGE_GUTTER } from "@/components/auth/formText";
import { useBookDetail } from "@/components/books/book/useBookDetail";
import { sideKey, useBookSide } from "@/components/books/book/useBookSide";
import BookHeader from "@/components/books/book/BookHeader";
import BookStatusCard, { BookUnavailable } from "@/components/books/book/BookStatusCard";
import ChapterRangeEditor from "@/components/books/book/ChapterRangeEditor";
import DeleteBookDialog from "@/components/books/book/DeleteBookDialog";
import ChapterList from "@/components/books/chapter/ChapterList";
import ChapterCard from "@/components/books/chapter/ChapterCard";
import DraftPanel from "@/components/books/panel/DraftPanel";
import SourcePanel from "@/components/books/panel/SourcePanel";
import TextTabPanel from "@/components/books/panel/TextTabPanel";
import CropDialog, { type CropView } from "@/components/books/panel/CropDialog";

/**
 * A book (#404, scheme A): its header and ⋯ menu, its chapters as cards that
 * open into what the parse found, and one panel beside them for a draft, a
 * page or a text tab read by ear.
 */
export default function BookPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = use(params);
	const detail = useBookDetail(id);
	const { book, error, readOnly, ranges, deletion } = detail;
	const panel = useBookSide(id);
	const { side } = panel;
	// Counted once it has loaded: Home lists the player's own books, never the sample.
	const { user } = useUser();
	useRecordVisit(user, "book", book && !readOnly ? id : null);
	const [openChapter, setOpenChapter] = useState<string | null>(null);
	const [crop, setCrop] = useState<CropView | null>(null);

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

	if (detail.missing || detail.unauthorized) {
		return (
			<div className={`bk ${PAGE_GUTTER}`}>
				<div className="bk-wrap bk-wrap-book gp-rise">
					<BookUnavailable unauthorized={detail.unauthorized} />
				</div>
			</div>
		);
	}

	const view = side?.view ?? null;
	const openExerciseId = view?.kind === "draft" ? view.draft.exercise.id : null;

	return (
		<div className="bk-bookpage" data-panel={side ? "" : undefined}>
			<div className={`bk ${PAGE_GUTTER}`}>
				{book === null ? (
					<div className="bk-wrap bk-wrap-book">
						{error ? (
							<p className="bk-card bk-lead">
								{isServiceDown(error) ? BOOKS_NOT_OPEN : "Could not load the book."}
							</p>
						) : (
							<Skeleton className="bk-book-skeleton" />
						)}
					</div>
				) : (
					<div className="bk-wrap bk-wrap-book gp-rise">
						<BookHeader
							book={book}
							readOnly={readOnly}
							onRename={detail.rename}
							onEditRanges={ranges.start}
							onRescan={detail.rescan}
							onDelete={deletion.ask}
						/>
						{readOnly ? (
							<p className="bk-howto">
								<b>How this page works.</b> One chapter of a real method book, read once by the import: what
								it teaches as notes, and what it asks you to play as drafts. Open a draft to play it beside the
								page it came from, edit it, or take it to the Tab page. Upload your own PDF on the books page to
								do the same with any chapter.
							</p>
						) : null}

						{ranges.editing && book.page_count ? (
							<ChapterRangeEditor
								initial={rangesFromChapters(book.chapters)}
								pageCount={book.page_count}
								saving={ranges.saving}
								serverError={ranges.saveError}
								onSave={ranges.save}
								onCancel={ranges.stop}
							/>
						) : book.status === "ready" ? (
							<ChapterList
								chapters={book.chapters}
								openId={openChapter}
								onOpen={setOpenChapter}
								renderCard={(chapter) => (
									<ChapterCard
										bookId={book.id}
										chapter={chapter}
										openExerciseId={openExerciseId}
										onChapter={detail.updateChapter}
										onOpenDraft={panel.openDraft}
										onLocate={(source) => panel.locate(source)}
										onReadTextTab={readOnly ? undefined : panel.readTextTab}
										readOnly={readOnly}
									/>
								)}
							/>
						) : (
							<BookStatusCard
								book={book}
								readOnly={readOnly}
								onRescan={detail.rescan}
								onDrawRanges={ranges.start}
							/>
						)}

						<DeleteBookDialog
							open={deletion.open}
							title={book.title}
							busy={deletion.busy}
							onConfirm={deletion.confirm}
							onClose={deletion.cancel}
						/>
					</div>
				)}
			</div>

			{view && book ? (
				view.kind === "draft" ? (
					<DraftPanel
						key={sideKey(view)}
						bookId={book.id}
						draft={view.draft}
						animateOpen={side?.entered}
						onClose={panel.close}
						onViewCrop={setCrop}
						onLocate={() =>
							panel.locate(
								{
									chapterId: view.draft.chapterId,
									page: view.draft.exercise.page,
									pages: [view.draft.exercise.page],
									title: view.draft.pattern.name,
								},
								view.draft,
							)
						}
					/>
				) : view.kind === "textTab" ? (
					<TextTabPanel
						key={sideKey(view)}
						book={book}
						page={view.page}
						animateOpen={side?.entered}
						onClose={panel.close}
					/>
				) : (
					(() => {
						const chapter = book.chapters.find((c) => c.id === view.source.chapterId);
						const back = view.back;
						return chapter ? (
							<SourcePanel
								key={sideKey(view)}
								book={book}
								chapter={chapter}
								source={view.source}
								animateOpen={side?.entered}
								onClose={panel.close}
								onBack={back ? () => panel.openDraft(back) : undefined}
							/>
						) : null;
					})()
				)
			) : null}
			<CropDialog crop={crop} onClose={() => setCrop(null)} />
		</div>
	);
}
