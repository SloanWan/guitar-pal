/**
 * Where the assistant's conversation waits between openings of the panel,
 * and when it is over.
 *
 * sessionStorage rather than memory alone: the hook that owns the transcript
 * lives in the topbar, which outlives the panel and every route change, so
 * memory covers closing and reopening. What memory does not cover is a
 * refresh — and a conversation that vanishes on F5 reads as lost work. The
 * tab is the natural end of it: nothing here is worth keeping across days.
 *
 * Two things end it sooner. Ten minutes of silence: a player who comes back
 * after that is starting over, and a stale thread above a fresh question
 * reads as clutter. And a change of who is signed in: the transcript may hold
 * the previous person's patterns by name, and the greeting is by name too.
 */

/** The transcript's shape, kept structural so this module owns no UI types. */
export interface StoredMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
}

export interface StoredConversation<M extends StoredMessage> {
	messages: M[];
	/** When the transcript last changed, in ms since the epoch. */
	touchedAt: number;
}

export const STORAGE_KEY = "guitarpal:strumAssistantConversation";
/** Bound the stored transcript so a long session does not grow without limit. */
export const MAX_STORED_MESSAGES = 40;
/** Silence after which the conversation is over. */
export const IDLE_MS = 10 * 60 * 1000;

export function isIdle(touchedAt: number, now: number): boolean {
	return now - touchedAt >= IDLE_MS;
}

function isMessage(value: unknown): value is StoredMessage {
	if (typeof value !== "object" || value === null) return false;
	const m = value as Partial<StoredMessage>;
	return (
		typeof m.id === "string" &&
		(m.role === "user" || m.role === "assistant") &&
		typeof m.text === "string"
	);
}

/**
 * The stored transcript, or nothing if there is none, it is unreadable, or it
 * has gone idle. Untrusted like any storage: only what reads as a message is
 * kept, and an older format (a bare array, with no timestamp) is treated as
 * idle rather than guessed at.
 */
export function readConversation<M extends StoredMessage>(now: number): M[] {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];
		const { messages, touchedAt } = parsed as Partial<StoredConversation<M>>;
		if (!Array.isArray(messages) || typeof touchedAt !== "number") return [];
		if (isIdle(touchedAt, now)) return [];
		return messages.filter(isMessage);
	} catch {
		return [];
	}
}

export function writeConversation<M extends StoredMessage>(messages: M[], now: number): void {
	try {
		if (messages.length === 0) {
			sessionStorage.removeItem(STORAGE_KEY);
			return;
		}
		const stored: StoredConversation<M> = {
			messages: messages.slice(-MAX_STORED_MESSAGES),
			touchedAt: now,
		};
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
	} catch {
		// Private mode or a full quota: the conversation still works, it just
		// does not survive a refresh.
	}
}
