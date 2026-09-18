import { createClient } from "@/lib/supabase";
import type { Book, BookDetail, ChapterRange } from "@/lib/books/types";

/**
 * The browser's side of book import. Everything but the upload goes through
 * `/api/books/*`, which forwards the session to the Python service; the
 * upload itself goes straight to Storage with the player's own session, so
 * a 100 MB PDF never passes through Next.js.
 */

const BUCKET = "books";

export class BookApiError extends Error {
	constructor(
		message: string,
		public readonly status: number,
	) {
		super(message);
		this.name = "BookApiError";
	}
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`/api/books${path}`, {
		...init,
		headers: { "Content-Type": "application/json", ...init?.headers },
	});
	if (response.status === 204) return undefined as T;
	const body: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		throw new BookApiError(readDetail(body) ?? `Request failed (${response.status}).`, response.status);
	}
	return body as T;
}

/** FastAPI's `{detail: ...}`, or the proxy's `{error: ...}`. */
function readDetail(body: unknown): string | null {
	if (typeof body !== "object" || body === null) return null;
	const record = body as Record<string, unknown>;
	if (typeof record.detail === "string") return record.detail;
	if (typeof record.error === "string") return record.error;
	// Pydantic validation errors come as a list; the first message is enough.
	if (Array.isArray(record.detail) && typeof record.detail[0]?.msg === "string") {
		return record.detail[0].msg;
	}
	return null;
}

export const listBooks = (): Promise<Book[]> => call("");
export const getBook = (id: string): Promise<BookDetail> => call(`/${id}`);
export const createBook = (title: string): Promise<Book> =>
	call("", { method: "POST", body: JSON.stringify({ title }) });
export const scanBook = (id: string): Promise<Book> => call(`/${id}/scan`, { method: "POST" });
export const renameBook = (id: string, title: string): Promise<Book> =>
	call(`/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });
export const replaceChapters = (id: string, chapters: ChapterRange[]): Promise<BookDetail> =>
	call(`/${id}/chapters`, { method: "PUT", body: JSON.stringify({ chapters }) });
export const deleteBook = (id: string): Promise<void> => call(`/${id}`, { method: "DELETE" });

/**
 * The PDF into the private bucket at the path the service handed out. The
 * bucket's policies check the path's first folder against the session's
 * user id, so this can only ever land under the player's own folder.
 */
export async function uploadBookFile(storagePath: string, file: File): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
		contentType: "application/pdf",
		upsert: true,
	});
	if (error) throw new BookApiError(`Upload failed: ${error.message}`, 0);
}

/** "Chord & Songwriting Cheat Sheet.pdf" → "Chord & Songwriting Cheat Sheet". */
export function titleFromFileName(name: string): string {
	return name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim() || "Untitled book";
}
