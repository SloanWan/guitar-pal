import type { ChordIndexEntry } from "@/lib/chordSearch";
import { routeAssistantInput } from "@/lib/strumAssistant/router";
import { buildProposal } from "@/lib/strumAssistant/buildProposal";
import type {
	AssistantProposal,
	AssistantReply,
	AssistantTurn,
} from "@/lib/strumAssistant/types";

/**
 * One turn of the conversation, decided.
 *
 * Lifted out of the panel's hook so the thing #136 actually promises — that a
 * plain chord line or a typed rhythm never reaches the model — is a property
 * something can assert, rather than a claim about code buried in a component.
 * `fetchImpl` is injected for the same reason: a test can watch it and see that
 * it was never called.
 */

export const DETERMINISTIC_REPLY = "Read straight from what you typed — no model needed.";
const UNAVAILABLE = "The assistant is unavailable right now.";
const UNREACHABLE = "Something went wrong reaching the assistant.";

export const ASSISTANT_ENDPOINT = "/api/strum-assistant";

export interface AssistantTurnOutcome {
	/** What the assistant says back. */
	text: string;
	/** Present when there is something concrete to preview. */
	proposal?: AssistantProposal;
	/** Set when the turn failed; the panel renders it as an error, not as speech. */
	failed?: boolean;
	/** Whether the model was reached at all — the router's decision, observable. */
	usedModel: boolean;
}

export interface ResolveTurnInput {
	/** What the user just typed. */
	text: string;
	/** The conversation to send, including this turn, already trimmed. */
	history: AssistantTurn[];
	index: readonly ChordIndexEntry[];
	fetchImpl?: typeof fetch;
}

export async function resolveAssistantTurn({
	text,
	history,
	index,
	fetchImpl = fetch,
}: ResolveTurnInput): Promise<AssistantTurnOutcome> {
	const route = routeAssistantInput(text, index);

	if (route.path !== "llm") {
		const built = buildProposal({
			rhythm: route.path === "rhythm" ? route.rhythm : null,
			chordWords: route.chordWords,
			index,
		});
		if (built.ok) {
			return { text: DETERMINISTIC_REPLY, proposal: built.proposal, usedModel: false };
		}
		// Notation that parses in the router but not here would be a bug, not a
		// user error; fall through to the model rather than dead-end.
	}

	try {
		const response = await fetchImpl(ASSISTANT_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ messages: history }),
		});

		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as { error?: string } | null;
			return { text: body?.error ?? UNAVAILABLE, failed: true, usedModel: true };
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
		return { text: reply.message, proposal, usedModel: true };
	} catch (e) {
		console.error("[assistant] send:", e);
		return { text: UNREACHABLE, failed: true, usedModel: true };
	}
}
