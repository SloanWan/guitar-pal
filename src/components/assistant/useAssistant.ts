"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getChordIndex } from "@/lib/chords";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { resolveAssistantTurn } from "@/lib/strumAssistant/turn";
import type { AssistantProposal, AssistantTurn } from "@/lib/strumAssistant/types";

/**
 * Drives one assistant conversation.
 *
 * The conversation's state lives here; deciding a turn lives in
 * `resolveAssistantTurn`, which runs the deterministic router before it reaches
 * for the network — so a typed rhythm or a plain chord line is answered from
 * memory, and that can be asserted rather than promised.
 */

export interface AssistantMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
	proposal?: AssistantProposal;
	/** Set when the turn failed; rendered as an error rather than as speech. */
	failed?: boolean;
	/**
	 * True once the panel has typed this message out. Kept on the message, and
	 * therefore in storage, so reopening the panel or refreshing shows the
	 * transcript as it stands rather than replaying it.
	 */
	streamed?: boolean;
}

/** Kept short: every turn is re-sent, and a long tail costs tokens per request. */
const MAX_HISTORY_TURNS = 10;

/**
 * Where the conversation waits between openings of the panel.
 *
 * sessionStorage rather than memory alone: the hook already lives in the
 * topbar, which outlives the panel and every route change, so memory covers
 * closing and reopening. What memory does not cover is a refresh — and a
 * conversation that vanishes on F5 reads as lost work. The tab is the natural
 * end of it: nothing here is worth keeping across days.
 */
const STORAGE_KEY = "guitarpal:strumAssistantConversation";
/** Bound the stored transcript so a long session does not grow without limit. */
const MAX_STORED_MESSAGES = 40;

function readStored(): AssistantMessage[] {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		// Untrusted like any storage: keep only what reads as a message.
		return parsed.filter(
			(m): m is AssistantMessage =>
				typeof m === "object" &&
				m !== null &&
				typeof (m as AssistantMessage).id === "string" &&
				((m as AssistantMessage).role === "user" || (m as AssistantMessage).role === "assistant") &&
				typeof (m as AssistantMessage).text === "string",
		);
	} catch {
		return [];
	}
}

function writeStored(messages: AssistantMessage[]): void {
	try {
		if (messages.length === 0) sessionStorage.removeItem(STORAGE_KEY);
		else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
	} catch {
		// Private mode or a full quota: the conversation still works, it just
		// does not survive a refresh.
	}
}

function newId(): string {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `m${Date.now()}${Math.random()}`;
}

export function useAssistant() {
	// Read once, lazily. Safe to differ between server and client: nothing that
	// renders the transcript is mounted until the popover opens, so the markup
	// React hydrates against does not depend on this.
	const [messages, setMessages] = useState<AssistantMessage[]>(() =>
		typeof window === "undefined" ? [] : readStored(),
	);
	const [pending, setPending] = useState(false);

	useEffect(() => {
		writeStored(messages);
	}, [messages]);
	const indexRef = useRef<Promise<readonly ChordIndexEntry[]> | null>(null);

	/** Fetched once per session, shared by every parse in this panel. */
	const chordIndex = useCallback(async (): Promise<readonly ChordIndexEntry[]> => {
		if (indexRef.current === null) {
			indexRef.current = getChordIndex().catch((e: unknown) => {
				console.error("[assistant] chord index:", e);
				// Reset so a later turn can retry rather than being stuck empty.
				indexRef.current = null;
				return [] as readonly ChordIndexEntry[];
			});
		}
		return indexRef.current;
	}, []);

	const reset = useCallback(() => setMessages([]), []);

	/** The panel has finished typing this message out. */
	const markStreamed = useCallback((id: string) => {
		setMessages((prev) =>
			prev.map((m) => (m.id === id && !m.streamed ? { ...m, streamed: true } : m)),
		);
	}, []);

	const send = useCallback(
		async (input: string) => {
			const text = input.trim();
			if (text === "" || pending) return;

			const userMessage: AssistantMessage = { id: newId(), role: "user", text };
			setMessages((prev) => [...prev, userMessage]);
			setPending(true);

			try {
				const index = await chordIndex();
				const history: AssistantTurn[] = [...messages, userMessage]
					.slice(-MAX_HISTORY_TURNS)
					.map((m) => ({ role: m.role, content: m.text }));

				const outcome = await resolveAssistantTurn({ text, history, index });
				setMessages((prev) => [
					...prev,
					{
						id: newId(),
						role: "assistant",
						text: outcome.text,
						proposal: outcome.proposal,
						...(outcome.failed ? { failed: true } : {}),
					},
				]);
			} finally {
				setPending(false);
			}
		},
		[chordIndex, messages, pending],
	);

	return { messages, pending, send, reset, markStreamed };
}
