import { normalizeChordName, searchChords, type ChordIndexEntry } from "@/lib/chordSearch";
import { DEFAULT_STRUM_BPM } from "@/lib/strumPatterns";
import { parseRhythm } from "@/lib/assistant/strum/parseRhythm";
import { withoutCapo } from "@/lib/assistant/strum/readCapo";

/**
 * Reads a request written as a sentence, without a model.
 *
 * "给我一个 C-G-Am-F 的民谣扫弦，慢一点" carries three facts — a chord run, a
 * style, a tempo — wrapped in words that carry none. The strict router refuses
 * the whole line because of the wrapping; this reads the facts out and, just as
 * importantly, says what it could *not* read. A sentence with anything left
 * over is not answered here: a pattern nobody asked for is worse than a model
 * call, so the leftover is the one thing the caller has to check.
 *
 * Deliberately a small lexicon. Every word added here is a chance to swallow a
 * meaning the player intended, and the eval set (#137) is where the coverage
 * that buys is measured before more is added.
 */

export interface StyleEntry {
	key: string;
	/** Words that name the style, any language. Matched whole for ASCII words. */
	words: readonly string[];
	/** The rhythm the style is answered with — a guess, and flagged as one. */
	rhythm: string;
	bpm: number;
}

export const STYLES: readonly StyleEntry[] = [
	{ key: "folk", words: ["民谣", "folk"], rhythm: "D DU UD", bpm: 80 },
	{ key: "pop", words: ["流行", "pop"], rhythm: "D DU UD", bpm: 95 },
	{ key: "rock", words: ["摇滚", "rock"], rhythm: "D DU UDU", bpm: 110 },
	{ key: "ballad", words: ["抒情", "慢歌", "ballad"], rhythm: "D DU UD", bpm: 65 },
];

/** Longest first, so "慢一点" is read before the "慢" inside it. */
const SLOWER = ["慢一点", "慢一些", "慢点", "慢些", "缓慢", "舒缓", "慢", "slower", "slowly", "slow"];
const FASTER = ["快一点", "快一些", "快点", "快些", "快", "faster", "fast", "quick", "upbeat"];

/** A written tempo wins over any adjective. */
const BPM_WRITTEN = /(\d{2,3})\s*(?:bpm|拍)/i;

/**
 * Words that ask without saying what for. Stripped so they do not count as
 * unread; nothing here changes the answer.
 */
const NOISE = [
	// Chinese
	"给我一个", "给我", "来一个", "来个", "帮我", "我想要", "我想", "想要", "请",
	"一个", "一段", "一套", "一条", "扫弦", "节奏型", "节奏", "伴奏", "和弦进行", "和弦",
	"风格", "曲风", "感觉", "版本", "稍微", "一点", "一些", "点", "些", "的", "吧", "呢", "啊",
	"吗", "要", "来", "用", "就", "再", "然后",
	// English
	"give me", "i want", "i'd like", "can you", "can i have", "please", "make it", "make",
	"something", "strumming", "strum", "pattern", "progression", "chords", "chord", "tempo",
	"a bit", "a little", "little", "bit", "more", "and", "with", "for", "the", "in", "at",
	"of", "me", "it", "an", "a", "some",
];

/** How much an adjective moves the tempo, before rounding to the nearest 5. */
const TEMPO_STEP = 0.15;

export interface PhraseReading {
	/** The chord run, as written. Empty unless at least two chords stood together. */
	chordWords: string[];
	style: string | null;
	/** From the style; null when no style was named. Always a guess. */
	rhythm: string | null;
	/**
	 * Rhythm the player wrote out — "D DU UD in 140 bpm" — as written. Not a
	 * guess, and it outranks the style's when both are present.
	 */
	notation: string | null;
	tempo: "slower" | "faster" | null;
	/** Written tempo, else the style's adjusted by the adjective; null with neither. */
	bpm: number | null;
	/** "name it test", "叫 test": what the player wants it called. */
	name: string | null;
	/** "capo 2", "变调夹 2 品": the fret the progression is held behind. */
	capo: number | null;
	/**
	 * What was not read, with nothing else in it. Empty means the whole sentence
	 * was understood — the only state in which this reading may be acted on.
	 */
	leftover: string;
}

/** A latin word that could begin with a note name. Case matters: `a` is an article. */
export const CHORD_TOKEN = /[A-G][A-Za-z0-9#♯♭+°ø/]*/g;
/** The same, for a reader that can afford lowercase — see `ChordRunOptions.tokens`. */
export const CHORD_TOKEN_ANY_CASE = /[A-Ga-g][A-Za-z0-9#♯♭+°ø/]*/g;
/** What may sit between two chords of one run. */
const RUN_GAP = /^[\s,，、\-–—→>|]*$/;

/**
 * "name it test", "call it test", "取名为 test", "叫 test" — the name a new
 * pattern should carry, read before anything else so a name that happens to
 * contain a chord ("call it C jam") is not read as one. Ends at punctuation.
 */
const NAME_CLAUSE =
	/(?:name it|call it|call this|named|name:|叫它|叫做|命名为|名字叫|取名为|取名|名为|叫)\s*[「『《"'`]?([^」』》"'`，。,.!?！？]{1,40})/i;
const NAME_TAIL = /(?:\s*(?:pattern|模式|节奏型|的))+$/i;

/** A word made only of the characters notation is written in. */
const RHYTHM_WORD = /^[DUXdux上下〇\-._|·]+$/;

/**
 * Rhythm written into a sentence: the longest run of notation-only words that
 * parses as a bar. "D" on its own does not count — it is the chord far more
 * often — and neither does a run every word of which is a chord ("D D D"),
 * since chords win that tie everywhere else in the app. Two struck cells is
 * the floor.
 */
function findNotation(
	input: string,
	index: readonly ChordIndexEntry[],
): { text: string; start: number; end: number } | null {
	// Words without the punctuation a sentence hangs on them: "UD," is UD.
	const words = [...input.matchAll(/[^\s,，。;；!?！？]+/g)].map((m) => ({
		text: m[0],
		start: m.index,
		end: m.index + m[0].length,
	}));

	let best: { text: string; start: number; end: number } | null = null;
	let i = 0;
	while (i < words.length) {
		if (!RHYTHM_WORD.test(words[i].text)) {
			i += 1;
			continue;
		}
		let j = i;
		while (j + 1 < words.length && RHYTHM_WORD.test(words[j + 1].text)) j += 1;
		const run = words.slice(i, j + 1);
		const text = input.slice(run[0].start, run[run.length - 1].end);
		const allChords = run.every((w) => isExactChord(w.text, index));
		const struck = (text.match(/[DUXdux上下〇]/g) ?? []).length;
		if (!allChords && struck >= 2 && parseRhythm(text).ok) {
			if (best === null || text.length > best.text.length) {
				best = { text, start: run[0].start, end: run[run.length - 1].end };
			}
		}
		i = j + 1;
	}
	return best;
}

/** A word that reads as a chord, and where it sat in the input. */
export interface ChordSpan {
	text: string;
	start: number;
	end: number;
}

/**
 * Whether a word names a chord the index has — exactly, not by the nearest
 * match search would offer. Domain-free: the tab readers use it too.
 */
export function isExactChord(token: string, index: readonly ChordIndexEntry[]): boolean {
	// The identity the word itself names, against the identity search lands on:
	// equal only for a real chord. "Bad" names B|ad and search offers B|add9,
	// which is how a fuzzy match is refused without a second matcher.
	const named = normalizeChordName(token);
	if (!named) return false;
	const found = searchChords(index, token, 1)[0];
	return found !== undefined && found.root === named.root && found.suffix === named.suffix;
}

/**
 * The longest run of chords standing together, and every chord outside it.
 *
 * A stray chord is kept as unread rather than dropped: "folk in A" names a key
 * the lexicon cannot write a progression for, and a lone capital "A" may just
 * as well be the article. Either way the sentence is not understood whole.
 *
 * `accept` decides what counts as a chord, because the two readers want
 * different answers: reading a request from scratch demands a word the library
 * actually carries, while reading an edit to an existing pattern takes anything
 * chord-shaped — an unmatched word there is shown to the player in red, not
 * silently ignored.
 */
export interface ChordRunOptions {
	/**
	 * How many chords make a run. Two, reading a sentence from scratch — a lone
	 * capital letter is as likely to be a word. One, reading an edit, where the
	 * player has already said which pattern they mean.
	 */
	minimum?: number;
	/**
	 * Which words are even looked at. Case is a filter in its own right: reading
	 * a request from scratch, `a` is an article and `A` is a chord, and only an
	 * instruction that already names its target can afford to read both.
	 */
	tokens?: RegExp;
}

export function findChordRun(
	input: string,
	accept: (token: string) => boolean,
	{ minimum = 2, tokens = CHORD_TOKEN }: ChordRunOptions = {},
): { run: ChordSpan[]; strays: ChordSpan[] } {
	const chords: ChordSpan[] = [];
	for (const match of input.matchAll(tokens)) {
		if (accept(match[0])) {
			chords.push({ text: match[0], start: match.index, end: match.index + match[0].length });
		}
	}

	let best: ChordSpan[] = [];
	let run: ChordSpan[] = [];
	for (const token of chords) {
		const previous = run[run.length - 1];
		const joined = previous !== undefined && RUN_GAP.test(input.slice(previous.end, token.start));
		run = joined ? [...run, token] : [token];
		if (run.length > best.length) best = run;
	}
	if (best.length < minimum) return { run: [], strays: chords };
	return { run: best, strays: chords.filter((c) => !best.includes(c)) };
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove a phrase wherever it stands; an ASCII phrase only as a whole word. */
function strip(text: string, phrases: readonly string[]): { text: string; hit: boolean } {
	let hit = false;
	let out = text;
	for (const phrase of [...phrases].sort((a, b) => b.length - a.length)) {
		const pattern = /^[\x20-\x7e]+$/.test(phrase)
			? new RegExp(`(?<![a-z])${escapeRegExp(phrase)}(?![a-z])`, "g")
			: new RegExp(escapeRegExp(phrase), "g");
		if (pattern.test(out)) {
			hit = true;
			out = out.replace(pattern, " ");
		}
	}
	return { text: out, hit };
}

function roundToFive(bpm: number): number {
	return Math.round(bpm / 5) * 5;
}

/** Blank a span out by position, so what follows is read from the same offsets. */
export function blankSpan(text: string, start: number, end: number): string {
	return text.slice(0, start) + " ".repeat(end - start) + text.slice(end);
}

/**
 * "name it test", "叫 test": the name a new pattern should carry, taken out
 * of the sentence so a chord-shaped word inside it ("call it C jam") is not
 * read as a chord. Domain-free: strum and tab read names the same way.
 */
export function readName(input: string): { name: string | null; text: string } {
	const naming = NAME_CLAUSE.exec(input);
	if (!naming) return { name: null, text: input };
	const name = naming[1].trim().replace(NAME_TAIL, "").trim() || null;
	return { name, text: blankSpan(input, naming.index, naming.index + naming[0].length) };
}

/** "90 bpm", "90拍": a tempo written out, taken out of the sentence. */
export function readWrittenBpm(input: string): { bpm: number | null; text: string } {
	const written = BPM_WRITTEN.exec(input);
	if (!written) return { bpm: null, text: input };
	return { bpm: Number(written[1]), text: input.replace(BPM_WRITTEN, " ") };
}

export function readPhrase(original: string, index: readonly ChordIndexEntry[]): PhraseReading {
	// The capo first: a number that must not be left over, on a word that must
	// not be read as a chord.
	const { text: rawInput, capo } = withoutCapo(original);

	// The name next: it is free text, and blanking it keeps a chord-shaped word
	// inside it ("C jam") from being read as a chord.
	const { name, text: input } = readName(rawInput);

	// Notation next, and blanked before the chords are read: "D DU UD" holds a
	// D that is not the chord.
	const notation = findNotation(input, index);
	const afterNotation = notation
		? input.slice(0, notation.start) + " ".repeat(notation.end - notation.start) + input.slice(notation.end)
		: input;
	const { run, strays } = findChordRun(afterNotation, (token) => isExactChord(token, index));

	// Blank every chord out by position rather than by text, so a "c" inside
	// "chords" is not mistaken for the chord that was read. Strays are blanked
	// too — and put back into the leftover below, so a noise word that happens
	// to spell a chord ("a") cannot make them disappear.
	let masked = afterNotation;
	for (const token of [...run, ...strays]) {
		masked = masked.slice(0, token.start) + " ".repeat(token.end - token.start) + masked.slice(token.end);
	}
	let text = masked.toLowerCase();

	const written = readWrittenBpm(text);
	const writtenBpm = written.bpm;
	text = written.text;

	let style: StyleEntry | null = null;
	for (const entry of STYLES) {
		const stripped = strip(text, entry.words);
		if (stripped.hit && style === null) {
			style = entry;
			text = stripped.text;
		}
	}

	let tempo: PhraseReading["tempo"] = null;
	const slower = strip(text, SLOWER);
	if (slower.hit) {
		tempo = "slower";
		text = slower.text;
	}
	const faster = strip(text, FASTER);
	if (faster.hit) {
		// Both at once is a sentence, not a tempo: leave it unread.
		tempo = tempo === null ? "faster" : null;
		text = faster.text;
	}

	text = strip(text, NOISE).text;
	const leftover =
		text.replace(/[\s\p{P}\p{S}\d]/gu, "") + strays.map((t) => t.text.toLowerCase()).join("");

	let bpm: number | null = writtenBpm;
	// A rhythm written out with a tempo word and no style still gets a tempo:
	// there is something to be slow, so the default is what is slowed.
	if (bpm === null && (style !== null || tempo !== null)) {
		const base = style?.bpm ?? DEFAULT_STRUM_BPM;
		bpm =
			tempo === "slower"
				? roundToFive(base * (1 - TEMPO_STEP))
				: tempo === "faster"
					? roundToFive(base * (1 + TEMPO_STEP))
					: base;
	}

	return {
		chordWords: run.map((t) => t.text),
		style: style?.key ?? null,
		rhythm: style?.rhythm ?? null,
		notation: notation?.text ?? null,
		name,
		capo,
		tempo,
		bpm,
		leftover,
	};
}

/**
 * Whether a reading says enough to be answered from: something musical was
 * read, and nothing was left unread. Chords alone are enough — the rhythm is
 * then the default, and flagged as a guess — and so is a style alone.
 */
export function phraseIsEnough(reading: PhraseReading): boolean {
	return (
		reading.leftover === "" &&
		(reading.chordWords.length >= 2 || reading.style !== null || reading.notation !== null)
	);
}
