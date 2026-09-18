import { blankSpan } from "@/lib/strumAssistant/readPhrase";

/**
 * Notes written out as strings and frets, one list each:
 *
 *     string:66544322, fret:8-11-10-8-10-8-8-11
 *
 * The fourth thing a player can type that needs no chord and no model — the
 * frets are in the sentence, so nothing is looked up. The two lists pair
 * up in order and must be the same length; `x` in the frets is a dead note.
 * Multi-digit frets need a separator (`-`, space or comma) between them;
 * string numbers are single digits and may run together.
 */

export interface NoteToken {
	/** Fingerpick order, 0 = high e. */
	stringIndex: number;
	/** A fret, or a dead note. */
	fret: number | "x";
}

const STRINGS_CLAUSE = /(?:strings?|弦)\s*[:：]?\s*([1-6](?:[\s,，\-]*[1-6])*)(?![\d])/i;
const FRETS_CLAUSE = /(?:frets?|品)\s*[:：]?\s*((?:\d{1,2}|x)(?:[\s,，\-]*(?:\d{1,2}|x))*)/i;

const MAX_FRET = 24;

export type StringFretReading =
	| { found: false }
	| { found: true; ok: true; notes: NoteToken[]; text: string }
	| { found: true; ok: false; error: string; text: string };

/**
 * Reads both lists out of the sentence, blanking them from the text handed
 * back so nothing after this reads the string numbers as a pick order.
 */
export function readStringFret(input: string): StringFretReading {
	const strings = STRINGS_CLAUSE.exec(input);
	const frets = FRETS_CLAUSE.exec(input);
	if (!strings && !frets) return { found: false };

	let text = input;
	for (const m of [strings, frets].filter((m): m is RegExpExecArray => m !== null).sort((a, b) => b.index - a.index)) {
		text = blankSpan(text, m.index, m.index + m[0].length);
	}
	if (!strings || !frets) {
		return {
			found: true,
			ok: false,
			error: strings
				? "The strings are there, but no frets — add fret: with one fret per string."
				: "The frets are there, but no strings — add string: with one string number per fret.",
			text,
		};
	}

	const stringNumbers = [...strings[1].matchAll(/[1-6]/g)].map((m) => Number(m[0]));
	const fretValues = [...frets[1].matchAll(/\d{1,2}|x/gi)].map((m) => (m[0].toLowerCase() === "x" ? ("x" as const) : Number(m[0])));

	if (stringNumbers.length !== fretValues.length) {
		return {
			found: true,
			ok: false,
			error: `${stringNumbers.length} string numbers but ${fretValues.length} frets — the two lists need one entry per note.`,
			text,
		};
	}
	const high = fretValues.find((f): f is number => f !== "x" && f > MAX_FRET);
	if (high !== undefined) {
		return { found: true, ok: false, error: `Fret ${high} is past the neck — the highest is ${MAX_FRET}.`, text };
	}

	return {
		found: true,
		ok: true,
		notes: stringNumbers.map((n, i) => ({ stringIndex: n - 1, fret: fretValues[i] })),
		text,
	};
}
