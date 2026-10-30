import { isMessage, type StoredMessage } from "@/lib/assistant/conversation";

/**
 * The chat library (#401): General conversations a signed-in player chose to
 * keep. Pure helpers; the reads and writes are in `assistantChatStore`.
 */

export interface SavedChatSummary {
	id: string;
	title: string;
	/** ISO timestamp of the last turn saved. */
	updatedAt: string;
}

/** How much of the first question names the chat. */
const TITLE_CHARS = 80;
/** The table's limit on a title, the player's own included. */
export const CHAT_TITLE_MAX = 120;

/**
 * Whether the thread holds anything worth keeping: a model's reply, typed out
 * — the offer to keep it waits, like everything under a reply, until it is said.
 */
export function hasModelReply(messages: readonly { model?: string; streamed?: boolean }[]): boolean {
	return messages.some((m) => typeof m.model === "string" && m.model !== "" && m.streamed === true);
}

/**
 * A chat is named by the first question the model answered — a thread may have
 * started in Strum or Tab — else by its first question; on one line, cut at a
 * word where it is long.
 */
export function chatTitle(messages: readonly (StoredMessage & { model?: string })[]): string {
	const asked = (m: StoredMessage) => m.role === "user" && m.text.trim() !== "";
	const answered = messages.findIndex((m) => typeof m.model === "string" && m.model !== "");
	const first = messages.slice(0, Math.max(0, answered)).findLast(asked) ?? messages.find(asked);
	const text = first ? first.text.replace(/\s+/g, " ").trim() : "";
	if (text === "") return "Chat";
	if (text.length <= TITLE_CHARS) return text;
	const cut = text.slice(0, TITLE_CHARS);
	const space = cut.lastIndexOf(" ");
	return `${(space > TITLE_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * A title the player typed, as it will be kept: on one line, within the
 * table's limit. Null when nothing is left — the chat keeps the name it had.
 */
export function cleanTitle(input: string): string | null {
	const text = input.replace(/\s+/g, " ").trim();
	return text === "" ? null : text.slice(0, CHAT_TITLE_MAX).trimEnd();
}

/**
 * A saved transcript read back. The row is the player's, but the shape is
 * still checked: anything that does not read as a message is dropped, and
 * every message is marked typed out, so opening a chat shows it as it stood
 * rather than typing it all again.
 */
export function readSavedMessages<M extends StoredMessage>(value: unknown): M[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isMessage).map((m) => ({ ...(m as M), streamed: true }));
}

/** Rows from the library list; any that do not read as a chat are dropped. */
export function readChatSummaries(value: unknown): SavedChatSummary[] {
	if (!Array.isArray(value)) return [];
	const out: SavedChatSummary[] = [];
	for (const row of value) {
		if (typeof row !== "object" || row === null) continue;
		const { id, title, updated_at } = row as Record<string, unknown>;
		if (typeof id !== "string" || typeof title !== "string" || typeof updated_at !== "string") continue;
		out.push({ id, title, updatedAt: updated_at });
	}
	return out;
}
