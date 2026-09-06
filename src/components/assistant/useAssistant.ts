"use client";

import { useCallback, useRef, useState } from "react";
import { getChordIndex } from "@/lib/chords";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { routeAssistantInput } from "@/lib/strumAssistant/router";
import { buildProposal } from "@/lib/strumAssistant/buildProposal";
import type {
	AssistantProposal,
	AssistantReply,
	AssistantTurn,
} from "@/lib/strumAssistant/types";

/**
 * Drives one assistant conversation.
 *
 * The deterministic router runs here rather than on the server, so a typed
 * rhythm or a plain chord line is answered from memory with no network call at
 * all — which is what makes "the model is only reached when determinism runs
 * out" a structural property rather than a promise.
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
				const route = routeAssistantInput(text, index);

				if (route.path !== "llm") {
					const built = buildProposal({
						rhythm: route.path === "rhythm" ? route.rhythm : null,
						chordWords: route.chordWords,
						index,
					});
					if (built.ok) {
						setMessages((prev) => [
							...prev,
							{
								id: newId(),
								role: "assistant",
								text: "Read straight from what you typed — no model needed.",
								proposal: built.proposal,
							},
						]);
						return;
					}
					// Notation that parses in the router but not here would be a bug,
					// not a user error; fall through to the model rather than dead-end.
				}

				const history: AssistantTurn[] = [...messages, userMessage]
					.slice(-MAX_HISTORY_TURNS)
					.map((m) => ({ role: m.role, content: m.text }));

				const response = await fetch("/api/strum-assistant", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ messages: history }),
				});

				if (!response.ok) {
					const body = (await response.json().catch(() => null)) as { error?: string } | null;
					setMessages((prev) => [
						...prev,
						{
							id: newId(),
							role: "assistant",
							text: body?.error ?? "The assistant is unavailable right now.",
							failed: true,
						},
					]);
					return;
				}

				const reply = (await response.json()) as AssistantReply;
				let proposal: AssistantProposal | undefined;
				if (reply.draft) {
					const built = buildProposal({
						rhythm: reply.draft.rhythm,
						chordWords: reply.draft.chords,
						name: reply.draft.name,
						bpm: reply.draft.bpm,
						rhythmGuessed: reply.draft.rhythmGuessed,
						index,
					});
					if (built.ok) proposal = built.proposal;
				}

				setMessages((prev) => [
					...prev,
					{ id: newId(), role: "assistant", text: reply.message, proposal },
				]);
			} catch (e) {
				console.error("[assistant] send:", e);
				setMessages((prev) => [
					...prev,
					{
						id: newId(),
						role: "assistant",
						text: "Something went wrong reaching the assistant.",
						failed: true,
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
