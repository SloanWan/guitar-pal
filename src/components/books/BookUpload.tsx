"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { BookApiError, createBook, scanBook, titleFromFileName, uploadBookFile } from "@/lib/books/api";
import { DenimButton, MONO_META, Panel } from "@/components/books/bookUi";

const MAX_BYTES = 100 * 1024 * 1024; // the bucket's own limit

/**
 * Pick or drop a PDF: the row is created first (that is where the Storage
 * path comes from), the file goes straight to the bucket with the player's
 * session, and the scan is kicked off before the page moves to the book.
 */
export default function BookUpload() {
	const router = useRouter();
	const inputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [dragging, setDragging] = useState(false);

	async function submit(file: File) {
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
	}

	function onDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault();
		setDragging(false);
		const file = event.dataTransfer.files[0];
		if (file && busy === null) void submit(file);
	}

	return (
		<Panel label="Upload">
			<div
				onDragOver={(e) => {
					e.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={onDrop}
				className={`m-4 flex flex-col items-center gap-3 border border-dashed px-6 py-8 text-center transition-colors ${
					dragging ? "border-denim bg-denim-tint" : "border-line-strong"
				}`}
			>
				<input
					ref={inputRef}
					type="file"
					accept="application/pdf,.pdf"
					className="sr-only"
					onChange={(e) => {
						const file = e.target.files?.[0];
						e.target.value = "";
						if (file) void submit(file);
					}}
				/>
				<DenimButton onClick={() => inputRef.current?.click()} disabled={busy !== null}>
					<Upload className="size-3.5" strokeWidth={1.5} strokeLinecap="square" aria-hidden="true" />
					{busy ?? "Choose a PDF"}
				</DenimButton>
				<p className={MONO_META}>or drop it here · up to 100 MB</p>
				<p className="max-w-md text-xs text-ink-dim">
					Books stay private to your account. Page text — and, for finding chapters, short page
					excerpts — is sent to the model API; nothing is shared between accounts.
				</p>
			</div>
		</Panel>
	);
}
