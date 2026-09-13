import type { ChordSpan } from "@/lib/strumAssistant/readPhrase";
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

/** What can be done to a pattern by name. */
export type EditOp = "attach" | "rename" | "delete";

export interface AttachIntent {
	kind: "attach";
	op: "attach";
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

export interface RenameIntent {
	kind: "rename";
	op: "rename";
	pattern: NamedPattern;
	/** Empty when the sentence said to rename but not to what. */
	newName: string;
}

export interface DeleteIntent {
	kind: "delete";
	op: "delete";
	pattern: NamedPattern;
	/**
	 * The sentence named chords, or said "progression": the player wants one
	 * progression gone, not the pattern. That is not something this does — a
	 * delete here takes the whole pattern and everything on it — so it must be
	 * refused rather than read as the bigger thing.
	 */
	aboutProgression: boolean;
}

export type EditIntentReading =
	| AttachIntent
	| RenameIntent
	| DeleteIntent
	/** The sentence named a pattern, and more than one of them answers to it. */
	| { kind: "ambiguous"; op: EditOp; name: string; matches: NamedPattern[] }
	/** The sentence named a pattern the player does not have — the chords may still be good. */
	| { kind: "unknown-pattern"; op: EditOp; name: string; chordWords: string[] };

/** Verbs that take a pattern away. */
const DELETE_VERBS = ["删除", "删掉", "删了", "去掉", "移除", "delete", "remove"];

/** Words that say the player means a progression, not the pattern it is on. */
const PROGRESSION_WORDS = /进行|和弦|progression|chords?/i;

/** Verbs that give a pattern a new name. */
const RENAME_VERBS = ["改名", "重命名", "改叫", "命名", "rename", "call"];
/**
 * The rename verbs that also name a *new* thing: "call it test", "命名为 test".
 * They read as a rename only when a pattern the player has is in the sentence;
 * otherwise the sentence is not an edit, and the naming is the phrase reader's.
 */
const NAMING_VERBS = new Set(["命名", "call"]);

/** Where the new name sits after a rename verb, in either language. */
const NEW_NAME =
	/(?:改名为|改名成|改名叫|重命名为|改叫|命名为|叫做|叫|\bto\b|\bas\b)\s*[「『《"'`]?([^」』》"'`，。,.!?！？]{1,40})/i;

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

/** Every latin word, chord or not; the run builder decides which is which. */
const LATIN_WORD = /[A-Za-z][A-Za-z0-9#♯♭+°ø/]*/g;

/**
 * What may sit between two chords of one run: separators, and the words either
 * language joins a list with. Anything else — "to", a Chinese verb, a name —
 * ends the run.
 */
const RUN_GAP = /^[\s,，、\-–—→>|]*(?:和|与|及)?[\s,，、\-–—→>|]*$/;

/** Latin words that join a list without being in it. */
const JOINERS = new Set(["and", "then", "plus"]);

/** Words that end a run outright, however short they are. */
const NOT_A_CHORD = new Set([
	"to", "into", "onto", "in", "on", "at", "of", "for", "with", "the", "an", "my", "it", "is",
	"also", "new", "one", "up", "all", "so", "or", "as", "by", "me",
]);

/**
 * A word that could be a chord the player meant, whether or not it reads as
 * one. "RM" in "C G AM RM F C" is not a chord, but it is where a chord goes:
 * dropping it would silently hand back a progression with a bar missing, and
 * ending the run at it would drop the chords before it. It is kept, and shown
 * in red — the same treatment the chord search gives a word it cannot place.
 */
function couldBeMeantAsChord(word: string): boolean {
	return word.length <= 6 && !NOT_A_CHORD.has(word.toLowerCase());
}

/**
 * The longest run of chords standing together, with the words between them.
 *
 * A run starts and ends on a chord-shaped word. Between two of those, any
 * short word that is not plainly English is carried along as a chord the
 * player may have meant. Runs are ranked by the chords they actually contain,
 * so a stray "A" never outranks a real progression.
 */
function chordRun(input: string): ChordSpan[] {
	const words: { span: ChordSpan; chord: boolean }[] = [];
	for (const match of input.matchAll(LATIN_WORD)) {
		const text = match[0];
		words.push({
			span: { text, start: match.index, end: match.index + text.length },
			chord: CHORD_SHAPE.test(text),
		});
	}

	let best: ChordSpan[] = [];
	let bestChords = 0;
	for (let i = 0; i < words.length; i++) {
		if (!words[i].chord) continue;
		const run: ChordSpan[] = [words[i].span];
		let chords = 1;
		// Short unknown words are held back until a chord follows them: a trailing
		// one ("add C G RM to…") is more likely prose than a chord.
		let held: ChordSpan[] = [];
		for (let j = i + 1; j < words.length; j++) {
			const gap = input.slice(words[j - 1].span.end, words[j].span.start);
			if (!RUN_GAP.test(gap)) break;
			const word = words[j].span.text;
			if (words[j].chord) {
				run.push(...held, words[j].span);
				held = [];
				chords += 1;
			} else if (JOINERS.has(word.toLowerCase())) {
				// "C and G": part of the list's grammar, not of the list.
				continue;
			} else if (couldBeMeantAsChord(word)) {
				held.push(words[j].span);
			} else {
				break;
			}
		}
		if (chords > bestChords) {
			best = run;
			bestChords = chords;
		}
	}
	return best;
}

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
/** Words that lead into a name without being part of it. */
const NAME_LEAD = /^(?:the|my|this|that|这个|那个|我的|那|这|把|将)\s*/i;

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasVerb(input: string, verbs: readonly string[]): string | null {
	const lower = input.toLowerCase();
	return (
		verbs.find((verb) =>
			ASCII_ONLY.test(verb)
				? new RegExp(`(?<![a-z])${escapeRegExp(verb)}(?![a-z])`).test(lower)
				: lower.includes(verb),
		) ?? null
	);
}

/**
 * The verb that turned this sentence into an instruction, and which kind.
 * Delete and rename are read first: they are the more specific claim, and
 * "加" is a character that plenty of unrelated words contain.
 */
function readVerb(input: string): { op: EditOp; verb: string } | null {
	const del = hasVerb(input, DELETE_VERBS);
	if (del) return { op: "delete", verb: del };
	const ren = hasVerb(input, RENAME_VERBS);
	if (ren) return { op: "rename", verb: ren };
	const add = hasVerb(input, ADD_VERBS);
	return add ? { op: "attach", verb: add } : null;
}

/** The name a rename asks for, with the words around it stripped. */
function newNameIn(input: string): string | null {
	const found = NEW_NAME.exec(input);
	if (!found) return null;
	const name = found[1].trim().replace(NAME_NOISE, "").trim();
	return name === "" ? null : name;
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

function tidyName(raw: string): string | null {
	const name = raw.trim().replace(NAME_LEAD, "").replace(NAME_NOISE, "").trim();
	return name === "" ? null : name;
}

/** The name the player seems to have meant, when the library holds no such thing. */
function guessName(input: string): string | null {
	const quoted = QUOTED.exec(input);
	const raw = quoted ? quoted[1] : (TARGET_AFTER.exec(input.trim())?.[1] ?? null);
	return raw === null ? null : tidyName(raw);
}

/**
 * For a rename or a delete the name follows the verb directly — "delete
 * wonderwall", "rename wonderwall to faith" — with nothing to mark it. What is
 * left once the verb and, for a rename, the new name are taken out, is it.
 */
function guessNameAfterVerb(input: string, verb: string, op: EditOp): string | null {
	const quoted = QUOTED.exec(input);
	if (quoted) return tidyName(quoted[1]);
	let rest = input.replace(new RegExp(escapeRegExp(verb), "i"), " ");
	if (op === "rename") {
		const marker = NEW_NAME.exec(rest);
		if (marker) rest = rest.slice(0, marker.index);
	}
	return tidyName(rest.replace(/[，。,.!?！？]/g, " "));
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
	/** What that verb asks for. */
	op: EditOp | null;
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
		op: null,
		matchedName: null,
		guessedName: null,
		chordWords: [],
		patternCount: patterns.length,
		patternNames: patterns.map((p) => p.name),
		reading: null,
	};

	const read = readVerb(input);
	if (read === null) return base;
	const { op, verb } = read;

	// The name goes first and is blanked out before the chords are read: a
	// pattern called "C jam" would otherwise lose its first word to the chord
	// run, and the run would gain a chord the player never wrote.
	const named = findName(input, patterns);
	const rest = named ? blank(input, named) : input;

	// "call it test" with no pattern of the player's in it is naming something
	// new, not renaming — leave the whole sentence to the readers that follow,
	// with nothing seen, so the guidance does not call it a rename either.
	if (op === "rename" && named === null && NAMING_VERBS.has(verb)) return base;

	// A rename's new name would be read as chord words, so only an attach — and
	// a delete, where chords mean the player wants one progression gone, which
	// is exactly what a delete must not be mistaken for — looks for them. One
	// chord is enough: the target is named, so this is not the guess the other
	// reader has to avoid.
	const found = op === "rename" ? [] : chordRun(rest);
	const run = tooWeakToAct(found) ? [] : found;
	const chordWords = run.map((c) => c.text);
	const guessed =
		named || run.length === 0
			? null
			: guessName(blank(rest, { start: run[0].start, end: run[run.length - 1].end }));

	const seen: EditIntentExplanation = {
		...base,
		verb,
		op,
		matchedName: named?.text ?? null,
		guessedName: guessed,
		chordWords,
	};

	// A named pattern is enough on its own. Half a request understood is worth
	// more than a whole one refused: the player is shown what was read and fills
	// in the rest, rather than typing the sentence again.
	if (named) {
		const matches = patterns.filter((p) => p.name.trim().toLowerCase() === named.text);
		if (matches.length > 1) {
			return { ...seen, reading: { kind: "ambiguous", op, name: named.text, matches } };
		}
		// A name that matched but resolves to nothing cannot happen — findName
		// only reports names it read off this very list.
		const pattern = matches[0];
		switch (op) {
			case "attach":
				return { ...seen, reading: { kind: "attach", op, pattern, chordWords } };
			case "rename":
				return {
					...seen,
					reading: { kind: "rename", op, pattern, newName: newNameIn(rest) ?? "" },
				};
			case "delete":
				return {
					...seen,
					reading: {
						kind: "delete",
						op,
						pattern,
						aboutProgression: chordWords.length > 0 || PROGRESSION_WORDS.test(rest),
					},
				};
		}
	}

	// No pattern of the player's was named. A name aimed at is still something to
	// answer — with the chords kept, so only the target has to be picked.
	const aimed = guessed ?? (op === "attach" ? guessName(rest) : guessNameAfterVerb(rest, verb, op));
	return aimed === null
		? seen
		: {
				...seen,
				guessedName: aimed,
				reading: { kind: "unknown-pattern", op, name: aimed, chordWords },
			};
}

export function parseEditIntent(
	input: string,
	patterns: readonly NamedPattern[],
): EditIntentReading | null {
	return explainEditIntent(input, patterns).reading;
}
