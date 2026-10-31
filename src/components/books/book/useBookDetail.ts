"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
	BookApiError,
	deleteBook,
	getBook,
	renameBook,
	replaceChapters,
	scanBook,
} from "@/lib/books/api";
import type { Chapter, ChapterRange } from "@/lib/books/types";
import { bookInFlight } from "@/lib/books/types";
import { isSampleBook } from "@/lib/books/sample";
import { usePolledResource } from "@/components/books/usePolledResource";
import { useNavRouter } from "@/components/nav-progress";

/**
 * A book's page, its data half (#404): the book, polled while it scans or a
 * chapter parses, and everything the player can do to it — rename, rescan,
 * draw the chapter ranges, delete. The sample (#241) loads the same way and
 * is never written.
 */
export function useBookDetail(id: string) {
	const router = useNavRouter();
	const load = useCallback(() => getBook(id), [id]);
	const { value: book, error, refresh, set: setBook } = usePolledResource(load, bookInFlight);
	const missing = error instanceof BookApiError && error.status === 404;
	// Signed out, the API answers 401 for any book but the sample (#262).
	const unauthorized = error instanceof BookApiError && error.status === 401;
	const readOnly = isSampleBook(id);

	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [deleting, setDeleting] = useState(false);

	// A chapter card polls its own chapter; the row learns the state from it.
	const updateChapter = useCallback(
		(chapter: Chapter) =>
			setBook((current) =>
				current
					? { ...current, chapters: current.chapters.map((c) => (c.id === chapter.id ? chapter : c)) }
					: current,
			),
		[setBook],
	);

	/** True when the title was saved (or did not change). */
	async function rename(title: string): Promise<boolean> {
		const next = title.trim();
		if (!book || !next || next === book.title) return true;
		try {
			const updated = await renameBook(book.id, next);
			setBook({ ...book, ...updated });
			return true;
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not rename the book.");
			return false;
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

	async function saveRanges(ranges: ChapterRange[]) {
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

	function stopEditing() {
		setEditing(false);
		setSaveError(null);
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

	return {
		book,
		error,
		missing,
		unauthorized,
		readOnly,
		updateChapter,
		rename,
		rescan,
		ranges: { editing, saving, saveError, start: () => setEditing(true), stop: stopEditing, save: saveRanges },
		deletion: {
			open: confirmDelete,
			busy: deleting,
			ask: () => setConfirmDelete(true),
			cancel: () => setConfirmDelete(false),
			confirm: remove,
		},
	};
}
