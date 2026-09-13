import {
	CHORD_TOKEN_ANY_CASE,
	findChordRun,
	type ChordSpan,
} from "@/lib/strumAssistant/readPhrase";
import type { NamedPattern } from "@/lib/lastPattern";

/**
 * Reading a request to change a pattern the player already has.
 *
 * "添加一个 Em9-D-C#-F#m7 和弦进行去 belief 里" is not a pattern to invent — it
 * names one, and says what to put on it. Nothing here is creative, so nothing
 * here needs a model: a verb, a name the player's own library carries, and a
 * run of chord words is the whole of it.
 *
 * Three requirements, all of them: without the verb it is a description, without
 * the chords there is nothing to attach, and without a target it is a chord line
 * the plain router already reads. Any one missing returns null, and the request
 * carries on to the readers that come after this one.
 *
 * Nothing is decided here about what to *do* — this only reports what the
 * sentence says. The player is asked before a row is written.
 */

/** Only "put a chord progression on it" for now; rename and delete are the same shape. */
export type EditOp = "attach";

export interface AttachIntent {
	kind: "attach";
	op: EditOp;
	pattern: NamedPattern;
	/**
	 * Chord words in order, exactly as written. Resolving them is the caller's
	 * job — a word the library cannot place is shown to the player, not dropped.
	 *
	 * Empty when the sentence named a pattern and no chords: the request was
	 * understood, half of it is missing, and the player fills that half in rather
	 * than being told the whole sentence failed.
	 */
	chordWords: string[];
}

export type EditIntentReading =
	| AttachIntent
	/** The sentence named a pattern, and more than one of them answers to it. */
	| { kind: "ambiguous"; name: string; matches: NamedPattern[] }
	/** The sentence named a pattern the player does not have — the chords may still be good. */
	| { kind: "unknown-pattern"; name: string; chordWords: string[] };

/** Verbs that put something onto something else. Chinese first, as typed. */
const ADD_VERBS = [
	"添加",
	"新增",
	"加上",
	"加入",
	"加到",
	"加进",
	"放到",
	"放进",
	"配上",
	"加",
	"append",
	"attach",
	"add",
	"put",
];

/**
 * A word shaped like a chord, whether or not the library carries it.
 *
 * Deliberately looser than the reader that answers a request from scratch: a
 * player naming `Em9` means the chord, and if the library has nothing for it
 * the right answer is to show it in red — not to read the sentence as if the
 * word were not there. "Bad" and "Give" still fail: their tails are neither a
 * quality nor a number.
 */
const CHORD_SHAPE =
	/^[A-G][#b♯♭]?(?:maj|min|aug|dim|sus|add|m|M|°|ø|\+)?\d*(?:[#b+-]\d+)*(?:\/[A-G][#b♯♭]?)?$/i;

/**
 * A single lowercase letter is not worth acting on.
 *
 * Lowercase is read here — "add c am f g to on the beat" is how people type —
 * but `a` in "add a progression to belief" is an article, and one letter on its
 * own carries no evidence either way. Two or more chords standing together, or
 * a word longer than a letter, is enough; `A` still reads as the chord it is.
 */
function tooWeakToAct(run: ChordSpan[]): boolean {
	return run.length === 1 && run[0].text.length === 1 && run[0].text === run[0].text.toLowerCase();
}

/** ASCII names match on word boundaries; a CJK name has none to match on. */
const ASCII_ONLY = /^[\x20-\x7e]+$/;

/** Quoted text, in the marks either language reaches for. */
const QUOTED = /[「『《"'`]([^」』》"'`]{1,60})[」』》"'`]/;

/** "… to X", "… 到 X 里" — where a target sits when the library has no such name. */
const TARGET_AFTER = /(?:\bto\b|\binto\b|\bonto\b|\bin\b|到|去|给|进)\s*([^，。,.!?！？]{1,60})$/i;

/** Words that trail a name without being part of it. */
const NAME_NOISE = /(pattern|模式|节奏型|图案|里|中|上|面|的)+$/gi;

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The verb that turned this sentence into an instruction, if any did. */
function addVerb(input: string): string | null {
	const lower = input.toLowerCase();
	return (
		ADD_VERBS.find((verb) =>
			ASCII_ONLY.test(verb)
				? new RegExp(`(?<![a-z])${escapeRegExp(verb)}(?![a-z])`).test(lower)
				: lower.includes(verb),
		) ?? null
	);
}

/** Where a pattern's name sits in the sentence, if it is in there at all. */
function findName(input: string, patterns: readonly NamedPattern[]): ChordSpan | null {
	const lower = input.toLowerCase();
	let best: ChordSpan | null = null;

	for (const pattern of patterns) {
		const name = pattern.name.trim().toLowerCase();
		// One character is not a name to search a sentence for — every "C" in it
		// would answer, including the chords.
		if (name.length < 2) continue;

		const matcher = ASCII_ONLY.test(name)
			? new RegExp(`(?<![a-z0-9])${escapeRegExp(name)}(?![a-z0-9])`)
			: new RegExp(escapeRegExp(name));
		const found = matcher.exec(lower);
		if (!found) continue;

		// The longest name wins: a library holding both "old" and "old faithful"
		// must not answer "add C G to old faithful" with the shorter one.
		if (best === null || name.length > best.text.length) {
			best = { text: name, start: found.index, end: found.index + name.length };
		}
	}
	return best;
}

/** The name the player seems to have meant, when the library holds no such thing. */
function guessName(input: string): string | null {
	const quoted = QUOTED.exec(input);
	const raw = quoted ? quoted[1] : (TARGET_AFTER.exec(input.trim())?.[1] ?? null);
	if (raw === null) return null;
	const name = raw.trim().replace(NAME_NOISE, "").trim();
	return name === "" ? null : name;
}

function blank(input: string, span: { start: number; end: number }): string {
	return input.slice(0, span.start) + " ".repeat(span.end - span.start) + input.slice(span.end);
}

/**
 * What the reader saw, step by step.
 *
 * Every `null` this function can return has a different cause, and from the
 * outside they look identical — which is no way to correct a rule. The panel
 * shows this verbatim in development instead of handing the sentence to the
 * model, so a miss is a thing to read rather than a thing to pay for.
 */
export interface EditIntentExplanation {
	/** The verb that made this an instruction, if one did. */
	verb: string | null;
	/** A name read off the player's own library. */
	matchedName: string | null;
	/** A name the sentence seems to aim at, when the library holds no such thing. */
	guessedName: string | null;
	chordWords: string[];
	/** How many patterns the reader was given — zero means it never had a chance. */
	patternCount: number;
	/** What they are called, which is the first thing to check when a name misses. */
	patternNames: string[];
	reading: EditIntentReading | null;
}

export function explainEditIntent(
	input: string,
	patterns: readonly NamedPattern[],
): EditIntentExplanation {
	const base: EditIntentExplanation = {
		verb: null,
		matchedName: null,
		guessedName: null,
		chordWords: [],
		patternCount: patterns.length,
		patternNames: patterns.map((p) => p.name),
		reading: null,
	};

	const verb = addVerb(input);
	if (verb === null) return base;

	// The name goes first and is blanked out before the chords are read: a
	// pattern called "C jam" would otherwise lose its first word to the chord
	// run, and the run would gain a chord the player never wrote.
	const named = findName(input, patterns);
	const rest = named ? blank(input, named) : input;

	// One chord is a one-bar progression, and worth attaching: the target has
	// already been named, so this is not the guess the other reader has to avoid.
	const found = findChordRun(rest, (token) => CHORD_SHAPE.test(token), {
		minimum: 1,
		tokens: CHORD_TOKEN_ANY_CASE,
	});
	const run = tooWeakToAct(found.run) ? [] : found.run;
	const chordWords = run.map((c) => c.text);
	const guessed =
		named || run.length === 0
			? null
			: guessName(blank(rest, { start: run[0].start, end: run[run.length - 1].end }));

	const seen: EditIntentExplanation = {
		...base,
		verb,
		matchedName: named?.text ?? null,
		guessedName: guessed,
		chordWords,
	};

	// A named pattern is enough on its own. Half a request understood is worth
	// more than a whole one refused: the player is shown what was read and fills
	// in the chords, rather than typing the sentence again.
	if (named) {
		const matches = patterns.filter((p) => p.name.trim().toLowerCase() === named.text);
		return {
			...seen,
			reading:
				matches.length > 1
					? { kind: "ambiguous", name: named.text, matches }
					: // A name that matched but resolves to nothing cannot happen —
						// findName only reports names it read off this very list.
						{ kind: "attach", op: "attach", pattern: matches[0], chordWords },
		};
	}

	// No pattern of the player's was named. A name aimed at is still something to
	// answer — with the chords kept, so only the target has to be picked.
	const aimed = guessed ?? guessName(rest);
	return aimed === null
		? seen
		: { ...seen, guessedName: aimed, reading: { kind: "unknown-pattern", name: aimed, chordWords } };
}

export function parseEditIntent(
	input: string,
	patterns: readonly NamedPattern[],
): EditIntentReading | null {
	return explainEditIntent(input, patterns).reading;
}
