import type { ChordIndexEntry } from "@/lib/chordSearch";
import { routeAssistantInput } from "@/lib/strumAssistant/router";
import { explainEditIntent, type EditIntentReading } from "@/lib/strumAssistant/editIntent";
import { readPhrase } from "@/lib/strumAssistant/readPhrase";
import { buildProposal } from "@/lib/strumAssistant/buildProposal";
import { suggestFrom } from "@/lib/strumAssistant/suggest";
import { smallTalk } from "@/lib/strumAssistant/smallTalk";
import type { EditIntentExplanation } from "@/lib/strumAssistant/editIntent";
import type { AssistantProposal } from "@/lib/strumAssistant/types";
import type { NamedPattern } from "@/lib/lastPattern";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";

/**
 * One turn of the conversation, decided — by the app, never by a model.
 *
 * A sentence with a clear intent is a shortcut past the page's own controls,
 * and a shortcut has to be exact: it is read by rules, and when the rules fall
 * short the reply says what was read and offers sentences that would have
 * worked. A vague request is a different thing — a question, not an
 * instruction — and belongs to a model with the app's own material behind it,
 * which is a later piece of work. Until then nothing here reaches the network.
 */

export const DETERMINISTIC_REPLY = "Read straight from what you typed.";
export const PHRASE_REPLY = "Read from your words. The rhythm is a suggestion — change it if it isn't yours.";

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
	/**
	 * Present when nothing read the sentence: sentences that would have, with
	 * blanks for what was missing, for the player to take into the composer.
	 */
	templates?: string[];
	/** Set when the turn failed; the panel renders it as an error, not as speech. */
	failed?: boolean;
	/**
	 * Present with `templates` when nothing read the sentence: what the readers
	 * saw in it, for the record that turns misses into eval cases.
	 */
	seen?: EditIntentExplanation;
}

export interface ResolveTurnInput {
	/** What the user just typed. */
	text: string;
	index: readonly ChordIndexEntry[];
	/** The player's own patterns, for a sentence that names one. */
	patterns?: readonly NamedPattern[];
}

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
				? `Add these chords to "${edit.pattern.name}"${edit.capo ? `, capo on ${edit.capo}` : ""}? Nothing is saved until you say so.`
				: `Read that as an edit to "${edit.pattern.name}", but no chords came through — nothing in it reads as one. Want to write them yourself?`;
		case "rename":
			if (isPreset(edit.pattern.id)) {
				return `"${edit.pattern.name}" is one of the shipped patterns, and those keep their names. Your own patterns can be renamed.`;
			}
			return edit.newName === ""
				? `Rename "${edit.pattern.name}" — to what?`
				: `Rename "${edit.pattern.name}" to "${edit.newName}"?`;
		case "delete":
			if (edit.aboutProgression) {
				return `I can delete a pattern of yours whole, not one progression on it. To remove a single progression from "${edit.pattern.name}", use its progressions tab. Nothing was changed.`;
			}
			if (isPreset(edit.pattern.id)) {
				return `"${edit.pattern.name}" is one of the shipped patterns and cannot be deleted. Its progressions can be, from the progressions tab.`;
			}
			return `Delete "${edit.pattern.name}"? This deletes the pattern itself — every progression written over it goes with it, and it cannot be undone. To remove only a progression, use the progressions tab instead.`;
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

export function resolveAssistantTurn({
	text,
	index,
	patterns = [],
}: ResolveTurnInput): AssistantTurnOutcome {
	// "hi" and "thanks" are not requests, and are answered before anything tries
	// to read them as one. Whole-message matches only.
	const talk = smallTalk(text);
	if (talk) return { text: talk.text, templates: talk.templates.length ? talk.templates : undefined };

	// An edit names its target, so it is read before anything else: "add C G to
	// belief" is a chord line to every reader that comes after this one.
	const seen = explainEditIntent(text, patterns);
	if (seen.reading) return { text: editMessage(seen.reading), edit: seen.reading };

	const route = routeAssistantInput(text, index);
	if (route.path !== "llm") {
		const built = buildProposal({
			rhythm: route.path === "chords" ? null : route.rhythm,
			chordWords: route.chordWords,
			bpm: route.path === "phrase" ? route.bpm : null,
			name: route.path === "phrase" ? route.name : null,
			capo: route.path === "phrase" ? route.capo : null,
			// A style word names a feel, not the strokes; a rhythm written out is the strokes.
			rhythmGuessed: route.path === "phrase" && route.rhythmGuessed,
			index,
		});
		if (built.ok) {
			return {
				text: route.path === "phrase" && route.rhythmGuessed ? PHRASE_REPLY : DETERMINISTIC_REPLY,
				proposal: built.proposal,
			};
		}
		// Notation that parses in the router but not here would be a bug, not a
		// user error; the guidance below at least hands back what was read.
	}

	// Nothing read it whole. Say what was read, and offer the sentences that
	// would have worked — never a model's guess at what was meant.
	const guidance = suggestFrom(seen, readPhrase(text, index));
	return { text: guidance.text, templates: guidance.templates, seen };
}
