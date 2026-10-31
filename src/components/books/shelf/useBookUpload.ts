"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BookApiError, createBook, scanBook, titleFromFileName, uploadBookFile } from "@/lib/books/api";
import { useNavRouter } from "@/components/nav-progress";

const MAX_BYTES = 100 * 1024 * 1024; // the bucket's own limit

/** Whether a drag carries files (not text or a link dragged off the page). */
const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

/**
 * Pick or drop a PDF (#404): the row is created first (that is where the
 * Storage path comes from), the file goes straight to the bucket with the
 * player's session, and the scan is kicked off before the page moves to the
 * book. While `enabled`, a file dragged anywhere over the window can be
 * dropped; `dragging` says one is over it.
 */
export function useBookUpload(enabled: boolean) {
	const router = useNavRouter();
	const inputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [dragging, setDragging] = useState(false);

	const submit = useCallback(
		async (file: File) => {
			if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
				toast.error("Only PDF files can be imported.");
				return;
			}
			if (file.size > MAX_BYTES) {
				toast.error("That PDF is over 100 MB.");
				return;
			}
			setBusy("Creating…");
			try {
				const book = await createBook(titleFromFileName(file.name));
				setBusy("Uploading…");
				await uploadBookFile(book.storage_path, file);
				setBusy("Starting the scan…");
				await scanBook(book.id);
				router.push(`/books/${book.id}`);
			} catch (e) {
				toast.error(e instanceof BookApiError ? e.message : "The upload did not go through.");
				setBusy(null);
			}
		},
		[router],
	);

	// The window's drag events, counted in and out: entering a child fires
	// `dragleave` on the parent, so a flag alone would flicker.
	const idle = enabled && busy === null;
	useEffect(() => {
		if (!idle) return;
		let depth = 0;
		function onEnter(e: DragEvent) {
			if (!carriesFiles(e)) return;
			depth += 1;
			setDragging(true);
		}
		function onOver(e: DragEvent) {
			if (carriesFiles(e)) e.preventDefault();
		}
		function onLeave(e: DragEvent) {
			if (!carriesFiles(e)) return;
			depth = Math.max(0, depth - 1);
			if (depth === 0) setDragging(false);
		}
		function onDrop(e: DragEvent) {
			if (!carriesFiles(e)) return;
			e.preventDefault();
			depth = 0;
			setDragging(false);
			const file = e.dataTransfer?.files[0];
			if (file) void submit(file);
		}
		window.addEventListener("dragenter", onEnter);
		window.addEventListener("dragover", onOver);
		window.addEventListener("dragleave", onLeave);
		window.addEventListener("drop", onDrop);
		return () => {
			window.removeEventListener("dragenter", onEnter);
			window.removeEventListener("dragover", onOver);
			window.removeEventListener("dragleave", onLeave);
			window.removeEventListener("drop", onDrop);
			setDragging(false);
		};
	}, [idle, submit]);

	return {
		/** What the upload is doing, for the button's label; null when idle. */
		busy,
		dragging,
		inputRef,
		choose: () => inputRef.current?.click(),
		onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			e.target.value = "";
			if (file) void submit(file);
		},
	};
}
