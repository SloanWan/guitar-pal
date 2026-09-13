import type { ChordIndexEntry } from "@/lib/chordSearch";
import { routeAssistantInput } from "@/lib/strumAssistant/router";
import {
	explainEditIntent,
	type EditIntentExplanation,
	type EditIntentReading,
} from "@/lib/strumAssistant/editIntent";
import { buildProposal } from "@/lib/strumAssistant/buildProposal";
import type {
	AssistantProposal,
	AssistantReply,
	AssistantTurn,
} from "@/lib/strumAssistant/types";
import type { NamedPattern } from "@/lib/lastPattern";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";

/**
 * One turn of the conversation, decided.
 *
 * Lifted out of the panel's hook so the thing #136 actually promises — that a
 * plain chord line or a typed rhythm never reaches the model — is a property
 * something can assert, rather than a claim about code buried in a component.
 * `fetchImpl` is injected for the same reason: a test can watch it and see that
 * it was never called.
 */

/**
 * What the assistant says about an edit it has read.
 *
 * Written here rather than asked for: the app knows exactly what it understood,
 * so a sentence about it costs nothing, cannot drift from what will be saved,
 * and comes out in one language every time.
 */
export function editMessage(edit: EditIntentReading): string {
	switch (edit.kind) {
		case "attach":
			return edit.chordWords.length > 0
				? `Add these chords to "${edit.pattern.name}"? Nothing is saved until you say so.`
				: `Read that as an edit to "${edit.pattern.name}", but no chords came through — nothing in it reads as one. Want to write them yourself?`;
		case "rename":
			if (isPreset(edit.pattern.id)) {
				return `"${edit.pattern.name}" is one of the shipped patterns, and those keep their names. Your own patterns can be renamed.`;
			}
			return edit.newName === ""
				? `Rename "${edit.pattern.name}" — to what?`
				: `Rename "${edit.pattern.name}" to "${edit.newName}"?`;
		case "delete":
			if (isPreset(edit.pattern.id)) {
				return `"${edit.pattern.name}" is one of the shipped patterns and cannot be deleted. Its progressions can be.`;
			}
			return `Delete "${edit.pattern.name}"? Every progression written over it goes with it. This cannot be undone.`;
		case "ambiguous":
			return `${edit.matches.length} of your patterns are called "${edit.name}". Which one did you mean?`;
		case "unknown-pattern":
			if (edit.op !== "attach") {
				return `You have no pattern called "${edit.name}". Check the name in the library.`;
			}
			return edit.chordWords.length > 0
				? `Read the chords as ${edit.chordWords.join(" ")}, but you have no pattern called "${edit.name}". Make it, or pick the one you meant?`
				: `Read that as an edit, and got neither half: "${edit.name}" is not one of your patterns, and no chords came through. Want to fill it in yourself?`;
	}
}

/** The shipped patterns are base patterns: a progression can hang off one, nothing else changes. */
export function isPreset(patternId: string): boolean {
	return PRESET_STRUM_PATTERNS.some((p) => p.id === patternId);
}

export const DETERMINISTIC_REPLY = "Read straight from what you typed — no model needed.";
export const PHRASE_REPLY = "Read from your words — no model needed. The rhythm is a suggestion.";
const UNAVAILABLE = "The assistant is unavailable right now.";
const UNREACHABLE = "Something went wrong reaching the assistant.";

export const ASSISTANT_ENDPOINT = "/api/strum-assistant";

function modelIsOff(): boolean {
	return (
		process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_ASSISTANT_MODEL !== "1"
	);
}

/**
 * Why the rules did not read this sentence, in the order they gave up.
 *
 * Written for whoever is extending them, which in development is the only
 * reader there is.
 */
export function explainMiss(text: string, seen: EditIntentExplanation): string {
	const lines = [`No rule read "${text}". The model is off in development.`];

	if (seen.patternCount === 0) {
		lines.push("· patterns: none were loaded — nothing could have matched a name.");
	} else if (seen.verb === null) {
		lines.push(`· verb: none found, so this is not an edit (${seen.patternCount} patterns known).`);
	} else {
		lines.push(`· verb: "${seen.verb}"`);
		lines.push(
			seen.matchedName !== null
				? `· pattern: "${seen.matchedName}"`
				: seen.guessedName !== null
					? `· pattern: "${seen.guessedName}" — no pattern of yours answers to it`
					: `· pattern: no name matched. Yours: ${seen.patternNames.slice(0, 10).join(", ")}${
						seen.patternNames.length > 10 ? ", …" : ""
					}`,
		);
		lines.push(
			seen.chordWords.length > 0
				? `· chords: ${seen.chordWords.join(" ")}`
				: "· chords: none — nothing in the sentence reads as one",
		);
	}

	return lines.join("\n");
}

export interface AssistantTurnOutcome {
	/** What the assistant says back. */
	text: string;
	/** Present when there is something concrete to preview. */
	proposal?: AssistantProposal;
	/**
	 * Present when the sentence asked for a change to a pattern that already
	 * exists. Nothing has been written: the player confirms or corrects it first.
	 */
	edit?: EditIntentReading;
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
	/** The player's own patterns, for a sentence that names one. */
	patterns?: readonly NamedPattern[];
	fetchImpl?: typeof fetch;
}

export async function resolveAssistantTurn({
	text,
	history,
	index,
	patterns = [],
	fetchImpl = fetch,
}: ResolveTurnInput): Promise<AssistantTurnOutcome> {
	// An edit names its target, so it is read before anything else: "add C G to
	// belief" is a chord line to every reader that comes after this one.
	const seen = explainEditIntent(text, patterns);
	if (seen.reading) {
		return { text: editMessage(seen.reading), edit: seen.reading, usedModel: false };
	}

	const route = routeAssistantInput(text, index);

	if (route.path !== "llm") {
		const built = buildProposal({
			rhythm: route.path === "chords" ? null : route.rhythm,
			chordWords: route.chordWords,
			bpm: route.path === "phrase" ? route.bpm : null,
			// A style word names a feel, not the strokes; the rhythm is chosen for it.
			rhythmGuessed: route.path === "phrase",
			index,
		});
		if (built.ok) {
			const text = route.path === "phrase" ? PHRASE_REPLY : DETERMINISTIC_REPLY;
			return { text, proposal: built.proposal, usedModel: false };
		}
		// Notation that parses in the router but not here would be a bug, not a
		// user error; fall through to the model rather than dead-end.
	}

	// In development the model is not reached at all: a rule that missed is
	// worth reading, and paying to have the sentence answered anyway hides the
	// miss behind a good-looking reply. Set NEXT_PUBLIC_ASSISTANT_MODEL=1 to
	// exercise the model path locally.
	if (modelIsOff()) {
		return { text: explainMiss(text, seen), failed: true, usedModel: false };
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
