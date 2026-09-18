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
 *
 * Several pairs in one message are several bars, in the order written:
 *
 *     string:66544322, fret:8-11-10-8-10-8-8-11
 *     string:55433211, fret:7-10-9-7-9-7-7-10
 *
 * Each pair is one bar — padded with rests if it falls short, split if it
 * runs over — so a phrase can be written bar by bar the way it is played.
 */

export interface NoteToken {
	/** Fingerpick order, 0 = high e. */
	stringIndex: number;
	/** A fret, or a dead note. */
	fret: number | "x";
}

const STRINGS_CLAUSE = /(?:strings?|弦)\s*[:：]?\s*([1-6](?:[\s,，\-]*[1-6])*)(?![\d])/gi;
const FRETS_CLAUSE = /(?:frets?|品)\s*[:：]?\s*((?:\d{1,2}|x)(?:[\s,，\-]*(?:\d{1,2}|x))*)/gi;

const MAX_FRET = 24;

export type StringFretReading =
	| { found: false }
	/** One group of notes per string/fret pair, in the order written. */
	| { found: true; ok: true; groups: NoteToken[][]; text: string }
	| { found: true; ok: false; error: string; text: string };

interface Clause {
	kind: "strings" | "frets";
	index: number;
	end: number;
	value: string;
}

/**
 * Reads every pair out of the sentence, blanking them from the text handed
 * back so nothing after this reads the string numbers as a pick order.
 */
export function readStringFret(input: string): StringFretReading {
	const clauses: Clause[] = [
		...[...input.matchAll(STRINGS_CLAUSE)].map((m) => ({ kind: "strings" as const, index: m.index, end: m.index + m[0].length, value: m[1] })),
		...[...input.matchAll(FRETS_CLAUSE)].map((m) => ({ kind: "frets" as const, index: m.index, end: m.index + m[0].length, value: m[1] })),
	].sort((a, b) => a.index - b.index);
	if (clauses.length === 0) return { found: false };

	let text = input;
	for (const clause of [...clauses].reverse()) text = blankSpan(text, clause.index, clause.end);

	// Pairs are made in reading order: a strings clause and the frets clause
	// next to it, whichever comes first.
	const groups: NoteToken[][] = [];
	for (let i = 0; i < clauses.length; i += 2) {
		const a = clauses[i];
		const b = clauses[i + 1];
		const bar = groups.length + 1;
		if (!b || a.kind === b.kind) {
			return {
				found: true,
				ok: false,
				error:
					a.kind === "strings"
						? `Bar ${bar} has strings but no frets — add fret: with one fret per string.`
						: `Bar ${bar} has frets but no strings — add string: with one string number per fret.`,
				text,
			};
		}
		const strings = a.kind === "strings" ? a : b;
		const frets = a.kind === "frets" ? a : b;
		const stringNumbers = [...strings.value.matchAll(/[1-6]/g)].map((m) => Number(m[0]));
		const fretValues = [...frets.value.matchAll(/\d{1,2}|x/gi)].map((m) =>
			m[0].toLowerCase() === "x" ? ("x" as const) : Number(m[0]),
		);
		if (stringNumbers.length !== fretValues.length) {
			return {
				found: true,
				ok: false,
				error: `Bar ${bar} has ${stringNumbers.length} string numbers but ${fretValues.length} frets — the two lists need one entry per note.`,
				text,
			};
		}
		const high = fretValues.find((f): f is number => f !== "x" && f > MAX_FRET);
		if (high !== undefined) {
			return { found: true, ok: false, error: `Fret ${high} is past the neck — the highest is ${MAX_FRET}.`, text };
		}
		groups.push(stringNumbers.map((n, j) => ({ stringIndex: n - 1, fret: fretValues[j] })));
	}

	return { found: true, ok: true, groups, text };
}
