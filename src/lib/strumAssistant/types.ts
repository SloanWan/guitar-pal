import type { Bar, ChordRef } from "@/lib/strumPatterns";

/**
 * What the assistant offers the user, before anything is written. Nothing here
 * reaches the database until the user confirms the preview — the model proposes,
 * the person disposes.
 */
export interface AssistantProposal {
	/** A bare rhythm, or a rhythm with a chord under each bar. */
	kind: "pattern" | "progression";
	name: string;
	/** Rhythm notation, the only rhythm representation the model ever emits. */
	rhythm: string;
	/** Expanded from `rhythm` on the client by parseRhythm — never by the model. */
	bars: Bar[];
	bpm: number | null;
	chords: ChordRef[];
	warnings: AssistantWarnings;
}

export interface AssistantWarnings {
	/** Chord words that matched nothing in the index, kept verbatim. */
	unresolvedChords: string[];
	/** The rhythm was not in the user's words; the assistant chose it. */
	rhythmGuessed: boolean;
	/** The notation did not fill the bar and was padded with rests. */
	padded: boolean;
	/** The model failed validation twice and a deterministic result was used. */
	fellBackToDeterministic: boolean;
}

/** One turn of the conversation, as sent to the route. */
export interface AssistantTurn {
	role: "user" | "assistant";
	content: string;
}

/** The route's reply: prose to show, and optionally something to preview. */
export interface AssistantReply {
	/** What the assistant says. Always present, even alongside a proposal. */
	message: string;
	/**
	 * Present when the assistant has something concrete to offer. The model
	 * returns notation and chord words; the client expands them.
	 */
	draft?: AssistantDraft;
}

/**
 * The model's raw offer. Deliberately narrow: notation strings and chord words
 * only. Frets, MIDI and cell arrays are unrepresentable here, so the model
 * cannot hallucinate them — they are derived from the chord tables instead.
 */
export interface AssistantDraft {
	kind: "pattern" | "progression";
	name: string;
	rhythm: string;
	chords: string[];
	bpm: number | null;
	rhythmGuessed: boolean;
}

export interface AssistantErrorBody {
	error: string;
	/** Set when the caller may retry later rather than never. */
	retryAfterSeconds?: number;
}
