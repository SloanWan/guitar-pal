"use client";

import { useCallback, useRef, useState } from "react";
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
}

/** Kept short: every turn is re-sent, and a long tail costs tokens per request. */
const MAX_HISTORY_TURNS = 10;

function newId(): string {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `m${Date.now()}${Math.random()}`;
}

export function useAssistant() {
	const [messages, setMessages] = useState<AssistantMessage[]>([]);
	const [pending, setPending] = useState(false);
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

	return { messages, pending, send, reset };
}
