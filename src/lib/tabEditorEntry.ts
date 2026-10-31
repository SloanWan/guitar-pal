import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { safeRedirectPath } from "@/lib/safeRedirect";
import { validateFingerpickPattern } from "@/lib/tabImport/validateFingerpickPattern";

/**
 * The tab editor's ways in and out (#358). The editor is a page of its own:
 * `/fingerpick/edit/<id>` opens one of the player's tabs, `/fingerpick/edit/new`
 * a blank one, and `/fingerpick/edit/new?draft=<token>` a tab handed over to be
 * checked — by the assistant, a pasted text tab or a book's page — which waits
 * in sessionStorage under that token. `from` is where Close and Save go back to.
 */

export const READER_PATH = "/fingerpick";
const EDITOR_PATH = "/fingerpick/edit";
export const NEW_TAB_ID = "new";

/** Where the editor was opened from, which is where it goes back to. */
export type EditorReturn = string;

/** Shown above the tab when it was not drawn here, so the player knows to check it. */
export interface EditorNotice {
	/** The heading, in place of the tab's name while it has none. */
	title: string;
	text: string;
	warnings?: readonly string[];
}

/** A book's page the draft was read from: shown beside the editor, marked taken on save. */
export interface EditorBookSource {
	bookId: string;
	exerciseId: string;
	/** The crop's storage path, signed when the editor opens. */
	cropPath: string | null;
	page: number;
}

/** A tab handed to the editor rather than read from the library. */
export interface EditorDraft {
	pattern: FingerpickPattern;
	notice: EditorNotice;
	book?: EditorBookSource;
}

export type EditorEntry =
	| { kind: "new"; from?: EditorReturn }
	| { kind: "edit"; id: string; from?: EditorReturn }
	| { kind: "draft"; token: string; from?: EditorReturn };

function withQuery(path: string, query: Record<string, string | undefined>): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
	const search = params.toString();
	return search ? `${path}?${search}` : path;
}

/** The editor's address for an entry. The reader is the default way back, so it is left out. */
export function editorHref(entry: EditorEntry): string {
	const from = entry.from && entry.from !== READER_PATH ? entry.from : undefined;
	switch (entry.kind) {
		case "new":
			return withQuery(`${EDITOR_PATH}/${NEW_TAB_ID}`, { from });
		case "edit":
			return withQuery(`${EDITOR_PATH}/${encodeURIComponent(entry.id)}`, { from });
		case "draft":
			return withQuery(`${EDITOR_PATH}/${NEW_TAB_ID}`, { draft: entry.token, from });
	}
}

/** What the editor's address asks for: the route's id plus its query. */
export function readEditorEntry(id: string, search: URLSearchParams): EditorEntry {
	const from = search.get("from") ?? undefined;
	if (id !== NEW_TAB_ID) return { kind: "edit", id, from };
	const token = search.get("draft");
	return token ? { kind: "draft", token, from } : { kind: "new", from };
}

/**
 * Where Close goes: the page the editor was opened from, only ever a path of
 * this site. After a save the reader opens on what was saved; a book's page
 * stays where it was.
 */
export function returnHref(from: string | undefined, savedId?: string): string {
	const target = safeRedirectPath(from, READER_PATH);
	if (savedId === undefined || target !== READER_PATH) return target;
	return withQuery(READER_PATH, { pattern: savedId });
}

/**
 * Unsaved edits: the working tab differs from what was opened. Compared as
 * text, as the modal always did, so every kind of change counts without each
 * edit having to say so.
 */
export function isEditorDirty(pristine: string, working: FingerpickPattern): boolean {
	return JSON.stringify(working) !== pristine;
}

// ─── The draft stash ──────────────────────────────────────────────────────────

const DRAFT_KEY = "guitarpal:tabEditorDraft";

interface StoredDraft {
	token: string;
	draft: EditorDraft;
}

/**
 * Puts a draft where the editor will find it and returns its token. One draft
 * at a time: handing over another replaces it. It stays until the editor saves
 * or discards it, so a reload of the editor opens it again.
 */
export function stashEditorDraft(draft: EditorDraft, token: string = crypto.randomUUID()): string {
	try {
		sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ token, draft } satisfies StoredDraft));
	} catch {
		// Private mode or a full quota: the editor opens on a blank tab instead.
	}
	return token;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function readNotice(value: unknown): EditorNotice | null {
	if (typeof value !== "object" || value === null) return null;
	const v = value as Record<string, unknown>;
	if (typeof v.title !== "string" || typeof v.text !== "string") return null;
	return { title: v.title, text: v.text, warnings: isStringArray(v.warnings) ? v.warnings : undefined };
}

function readBook(value: unknown): EditorBookSource | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const v = value as Record<string, unknown>;
	if (typeof v.bookId !== "string" || typeof v.exerciseId !== "string" || typeof v.page !== "number") return undefined;
	return {
		bookId: v.bookId,
		exerciseId: v.exerciseId,
		cropPath: typeof v.cropPath === "string" ? v.cropPath : null,
		page: v.page,
	};
}

/**
 * The draft under `token`, validated as anything read back from storage is:
 * a stale token, a broken stash or a pattern the validator refuses reads as none.
 */
export function readEditorDraft(token: string): EditorDraft | null {
	let raw: string | null = null;
	try {
		raw = sessionStorage.getItem(DRAFT_KEY);
	} catch {
		return null;
	}
	if (raw === null) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null) return null;
	const stored = parsed as Record<string, unknown>;
	if (stored.token !== token || typeof stored.draft !== "object" || stored.draft === null) return null;
	const draft = stored.draft as Record<string, unknown>;
	const notice = readNotice(draft.notice);
	const { pattern } = validateFingerpickPattern(draft.pattern);
	if (!notice || !pattern) return null;
	return { pattern, notice, book: readBook(draft.book) };
}

/** The draft is used (saved) or thrown away (discarded): it no longer waits. */
export function clearEditorDraft(): void {
	try {
		sessionStorage.removeItem(DRAFT_KEY);
	} catch {
		// nothing to clear
	}
}
