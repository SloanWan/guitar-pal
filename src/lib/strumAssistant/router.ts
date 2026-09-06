import type { ChordIndexEntry } from "@/lib/chordSearch";
import { parseChordSequence } from "@/lib/strumProgressions";
import { parseRhythm } from "@/lib/strumAssistant/parseRhythm";

/**
 * Decides, without any model call, whether the user's words already say enough.
 *
 * This is the load-bearing design choice of the strum assistant (#136): the
 * model is only reached when determinism runs out. It runs on the client
 * because both things it needs — the rhythm parser and the chord index — are
 * already there, so a deterministic request never touches the network at all.
 *
 * It is not a security boundary. The route still authenticates and rate-limits;
 * this only decides whether calling it is worth doing.
 */

/** Segments are written one per idea: "C Am F G, DUDUDU". */
const SEGMENT_SEPARATOR = /[,，、;；\n]+/;

export type AssistantRoute =
	| { path: "chords"; chordWords: string[] }
	| { path: "rhythm"; rhythm: string; chordWords: string[] }
	| { path: "llm"; reason: LlmReason };

export type LlmReason = "empty" | "unrecognised-segment" | "multiple-rhythms";

function isChordSegment(segment: string, index: readonly ChordIndexEntry[]): string[] | null {
	if (index.length === 0) return null;
	const parsed = parseChordSequence(segment, index);
	if (parsed.tokens.length === 0 || parsed.unmatched.length > 0) return null;
	return parsed.tokens.map((t) => t.input);
}

function isRhythmSegment(segment: string): boolean {
	return parseRhythm(segment).ok;
}

/**
 * Chords win ties. A lone "D" is far more likely to be the chord than a
 * one-stroke rhythm, and "D DU UD" is not a resolvable chord line, so trying
 * chords first and falling back to rhythm separates the two without a
 * hand-written ambiguity table.
 */
export function routeAssistantInput(
	input: string,
	index: readonly ChordIndexEntry[],
): AssistantRoute {
	const segments = input
		.split(SEGMENT_SEPARATOR)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	if (segments.length === 0) return { path: "llm", reason: "empty" };

	const chordWords: string[] = [];
	const rhythms: string[] = [];

	for (const segment of segments) {
		const chords = isChordSegment(segment, index);
		if (chords !== null) {
			chordWords.push(...chords);
			continue;
		}
		if (isRhythmSegment(segment)) {
			rhythms.push(segment);
			continue;
		}
		return { path: "llm", reason: "unrecognised-segment" };
	}

	// Two rhythms in one line is a phrase, not a pattern; let the model read it.
	if (rhythms.length > 1) return { path: "llm", reason: "multiple-rhythms" };
	if (rhythms.length === 1) return { path: "rhythm", rhythm: rhythms[0], chordWords };
	return { path: "chords", chordWords };
}
