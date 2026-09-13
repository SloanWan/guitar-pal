import type { EditIntentExplanation } from "@/lib/strumAssistant/editIntent";
import type { PhraseReading } from "@/lib/strumAssistant/readPhrase";

/**
 * What to say when nothing read the sentence.
 *
 * A sentence the rules could not read is not sent to a model to be answered
 * anyway — that would hide the miss behind a good-looking reply, and hand the
 * player something they did not ask for. It is answered with what *was* read,
 * turned back into sentences the rules do read, with blanks where the rest
 * goes. The player picks one, fills the blank, and sends it: the fastest way
 * back on the path, and every miss teaches the phrasing.
 *
 * The blank is `___`, and the composer puts the caret on it.
 */

export const BLANK = "___";

export interface Guidance {
	/** What the assistant says. */
	text: string;
	/** Sentences offered, each ready to be filled in and sent. */
	templates: string[];
}

/** The five things a sentence can ask for, as sentences with blanks. */
const INTENTS: readonly string[] = [
	`add ${BLANK} to ${BLANK}`,
	`C G Am F`,
	`D DU UD`,
	`rename ${BLANK} to ${BLANK}`,
	`delete ${BLANK}`,
];

function unique(templates: string[]): string[] {
	return [...new Set(templates)];
}

export function suggestFrom(seen: EditIntentExplanation, phrase: PhraseReading): Guidance {
	const chords = seen.chordWords.length > 0 ? seen.chordWords : phrase.chordWords;
	const chordLine = chords.join(" ");

	// An instruction that fell short: keep what it said, blank what it did not.
	if (seen.op !== null) {
		const target = seen.matchedName;
		switch (seen.op) {
			case "attach":
				if (chords.length > 0 && target === null) {
					return {
						text: `Read the chords as ${chordLine}, but not where to put them. One of these?`,
						templates: [`add ${chordLine} to ${BLANK}`, `make a pattern called ${BLANK} with ${chordLine}`],
					};
				}
				if (chords.length === 0 && target !== null) {
					return {
						text: `Read that as an edit to "${target}", but no chords came through. Fill them in?`,
						templates: [`add ${BLANK} to ${target}`],
					};
				}
				return {
					text: "Read that as adding chords to a pattern, but neither the chords nor the pattern came through.",
					templates: [`add ${BLANK} to ${BLANK}`],
				};
			case "rename":
				return target === null
					? {
							text: `Read that as a rename, but not of which pattern. You have ${seen.patternCount}.`,
							templates: [`rename ${BLANK} to ${BLANK}`],
						}
					: {
							text: `Rename "${target}" — to what?`,
							templates: [`rename ${target} to ${BLANK}`],
						};
			case "delete":
				return {
					text: `Read that as a delete, but not of which pattern. You have ${seen.patternCount}.`,
					templates: [`delete ${BLANK}`],
				};
		}
	}

	// Not an instruction, but something musical was in it.
	if (phrase.notation !== null) {
		const strokes = phrase.notation;
		return {
			text: `Read the rhythm as ${strokes}. The rest I could not place — one of these?`,
			templates: unique([
				strokes,
				chords.length > 0 ? `${chordLine}, ${strokes}` : `${BLANK} ${BLANK} ${BLANK} ${BLANK}, ${strokes}`,
				`${strokes} in ${BLANK} bpm`,
			]),
		};
	}
	if (chords.length >= 2) {
		return {
			text: `Read the chords as ${chordLine}. The rest I could not place — one of these?`,
			templates: unique([
				chordLine,
				`${chordLine}, D DU UD`,
				`add ${chordLine} to ${BLANK}`,
				...(phrase.style ? [`${chordLine} ${phrase.style}`] : []),
			]),
		};
	}
	if (phrase.style !== null || phrase.tempo !== null) {
		const feel = [phrase.style, phrase.tempo === "slower" ? "slow" : phrase.tempo === "faster" ? "fast" : null]
			.filter((w): w is string => w !== null)
			.join(" ");
		return {
			text: `Read "${feel}", and nothing else I could use. Name the chords, or the rhythm?`,
			templates: [`${feel} ${BLANK}`, `${feel}, ${BLANK} ${BLANK} ${BLANK} ${BLANK}`],
		};
	}

	// Nothing at all. Ask what was meant, as sentences.
	return {
		text: "I didn't get that. Pick what you meant and fill in the blanks — chords, a rhythm, or a change to a pattern you have.",
		templates: [...INTENTS],
	};
}
