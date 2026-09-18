import { blankSpan } from "@/lib/assistant/strum/readPhrase";

/**
 * Notes written out as strings and frets, one list each:
 *
 *     string:66544322, fret:8-11-10-8-10-8-8-11
 *
 * The fourth thing a player can type that needs no chord and no model — the
 * frets are in the sentence, so nothing is looked up. The two lists pair
 * up in order and must be the same length; `x` in the frets is a dead note.
 * String numbers are single digits and may run together. Frets may too —
 * `fret:5768` is four frets — with a two-digit fret in parentheses,
 * `5768(11)(12)`, or the list written with separators, `8-11-10-8`.
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
const FRET_TOKEN = String.raw`(?:\(\d{1,2}\)|（\d{1,2}）|\d+|x)`;
const FRETS_CLAUSE = new RegExp(String.raw`(?:frets?|品)\s*[:：]?\s*(${FRET_TOKEN}(?:[\s,，\-]*${FRET_TOKEN})*)`, "gi");

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
 * The frets of one list. Groups are split at separators; a group that is
 * one number is that fret (`8-11-10-8`), and anything else is read a
 * character at a time — a digit is a fret, `(11)` is a two-digit fret, `x`
 * is a dead note — so `5768(11)x` is six notes. A bare two-digit group past
 * the neck, `57`, can only have meant two frets.
 */
function readFretList(list: string): (number | "x")[] {
	const out: (number | "x")[] = [];
	for (const group of list.split(/[\s,，\-]+/).filter((g) => g !== "")) {
		if (/^\d{1,2}$/.test(group) && Number(group) <= MAX_FRET) {
			out.push(Number(group));
			continue;
		}
		for (const token of group.matchAll(/\((\d{1,2})\)|（(\d{1,2})）|(\d)|(x)/gi)) {
			if (token[4] !== undefined) out.push("x");
			else out.push(Number(token[1] ?? token[2] ?? token[3]));
		}
	}
	return out;
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
		const fretValues = readFretList(frets.value);
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
