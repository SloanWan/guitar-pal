import { normalizeChordName, searchChords, type ChordIndexEntry } from "@/lib/chordSearch";
import { DEFAULT_STRUM_BPM } from "@/lib/strumPatterns";

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
	tempo: "slower" | "faster" | null;
	/** Written tempo, else the style's adjusted by the adjective; null with neither. */
	bpm: number | null;
	/**
	 * What was not read, with nothing else in it. Empty means the whole sentence
	 * was understood — the only state in which this reading may be acted on.
	 */
	leftover: string;
}

/** A latin word that could begin with a note name. Case matters: `a` is an article. */
const CHORD_TOKEN = /[A-G][A-Za-z0-9#♯♭+°ø/]*/g;
/** What may sit between two chords of one run. */
const RUN_GAP = /^[\s,，、\-–—→>|]*$/;

interface Token {
	text: string;
	start: number;
	end: number;
}

function isExactChord(token: string, index: readonly ChordIndexEntry[]): boolean {
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
 */
function chordRun(
	input: string,
	index: readonly ChordIndexEntry[],
): { run: Token[]; strays: Token[] } {
	const chords: Token[] = [];
	for (const match of input.matchAll(CHORD_TOKEN)) {
		if (isExactChord(match[0], index)) {
			chords.push({ text: match[0], start: match.index, end: match.index + match[0].length });
		}
	}

	let best: Token[] = [];
	let run: Token[] = [];
	for (const token of chords) {
		const previous = run[run.length - 1];
		const joined = previous !== undefined && RUN_GAP.test(input.slice(previous.end, token.start));
		run = joined ? [...run, token] : [token];
		if (run.length > best.length) best = run;
	}
	if (best.length < 2) return { run: [], strays: chords };
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

export function readPhrase(input: string, index: readonly ChordIndexEntry[]): PhraseReading {
	const { run, strays } = chordRun(input, index);

	// Blank every chord out by position rather than by text, so a "c" inside
	// "chords" is not mistaken for the chord that was read. Strays are blanked
	// too — and put back into the leftover below, so a noise word that happens
	// to spell a chord ("a") cannot make them disappear.
	let masked = input;
	for (const token of [...run, ...strays]) {
		masked = masked.slice(0, token.start) + " ".repeat(token.end - token.start) + masked.slice(token.end);
	}
	let text = masked.toLowerCase();

	const written = BPM_WRITTEN.exec(text);
	const writtenBpm = written ? Number(written[1]) : null;
	if (written) text = text.replace(BPM_WRITTEN, " ");

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
	return reading.leftover === "" && (reading.chordWords.length >= 2 || reading.style !== null);
}
