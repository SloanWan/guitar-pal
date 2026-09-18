import type { ChordIndexEntry } from "@/lib/chordSearch";
import { normalizeChordName } from "@/lib/chordSearch";
import type { Duration } from "@/lib/fingerpickTypes";
import type { PickToken } from "@/lib/fingerpickPickSequence";
import { parseChordSequence } from "@/lib/strumProgressions";
import { isSupportedMeter } from "@/lib/strumMeter";
import { withoutCapo } from "@/lib/strumAssistant/readCapo";
import {
	CHORD_TOKEN_ANY_CASE,
	blankSpan,
	isExactChord,
	readName,
	readWrittenBpm,
} from "@/lib/strumAssistant/readPhrase";
import { isOrderWord, parsePickOrder } from "@/lib/tabAssistant/parsePickOrder";
import { readStringFret, type NoteToken } from "@/lib/tabAssistant/parseStringFret";
import { TAB_STYLES, type TabStyleEntry } from "@/lib/tabAssistant/styles";
import type { ChordWord } from "@/lib/tabAssistant/types";

/**
 * One sentence about a fingerpicking pattern, read whole by rules.
 *
 * The tab counterpart of `readPhrase`: the tempo, name and capo are read by
 * the same functions strum uses; the rest — a pick order, a style word, a
 * meter, a note value — is fingerpicking's own. Whatever is left when all of
 * that is taken out has to be chord words, or the sentence was not read.
 */

/** "3/4", "6/8", "in 12/8", "3/4拍", "三拍子", "六八拍". */
const METER_WORDS: readonly { words: readonly string[]; meter: [number, number] }[] = [
	{ words: ["四四拍", "四拍子"], meter: [4, 4] },
	{ words: ["四三拍", "三四拍", "三拍子"], meter: [3, 4] },
	{ words: ["四二拍", "二拍子"], meter: [2, 4] },
	{ words: ["八六拍", "六八拍"], meter: [6, 8] },
	{ words: ["八十二拍", "十二八拍"], meter: [12, 8] },
];
const METER_WRITTEN = /(?<![\d/])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])\s*(?:拍子|拍|time)?/g;

/** "/16", "16ths", "sixteenths", "十六分"; "/8", "eighths", "八分". Not "/4": `5/4` is a thumb. */
const DURATION_WORDS: readonly { words: readonly string[]; duration: Duration }[] = [
	{ words: ["/16", "16ths", "16th", "sixteenths", "sixteenth", "十六分音符", "十六分"], duration: "sixteenth" },
	{ words: ["/8", "8ths", "8th", "eighths", "eighth", "八分音符", "八分"], duration: "eighth" },
];

/**
 * Words that ask without saying what for. Stripped so they do not count as
 * unread; nothing here changes the answer.
 */
const NOISE = [
	// Chinese
	"给我一个", "给我", "来一个", "来个", "帮我", "我想要", "我想", "想要", "请",
	"一个", "一段", "一套", "一条", "指弹", "分解", "节奏型", "节奏", "伴奏", "和弦进行", "和弦",
	"风格", "曲风", "感觉", "版本", "的", "吧", "呢", "啊", "吗", "要", "来", "用", "就", "再", "然后",
	// English
	"give me", "i want", "i'd like", "can you", "can i have", "please", "make it", "make",
	"something", "fingerpicking", "fingerpick", "fingerstyle", "picking", "pick", "pattern",
	"progression", "chords", "chord", "over", "with", "for", "the", "in", "at", "on", "of",
	"me", "it", "an", "a", "some", "and", "style",
];

/**
 * A word spelled the way a chord is — a root and a suffix made of the parts a
 * suffix can be made of — when the library has nothing for it. Cmaj13#11 is
 * a chord the player meant and it keeps its bar; "Give" is not, whatever its
 * first letter says.
 */
const CHORD_SPELLING =
	/^[A-G][#b♯♭]?(?:maj|min|dim|aug|sus|add|m|M|\+|-|°|ø|Δ|#|b|♯|♭|\d+|\/[A-G][#b♯♭]?)*$/;

export function looksLikeChord(word: string): boolean {
	return CHORD_SPELLING.test(word) && normalizeChordName(word) !== null;
}

export interface TabSentenceReading {
	/** Every chord word in typed order, resolved or not. */
	chordWords: ChordWord[];
	/** Notes written as string-and-fret pairs, one group per pair — one bar each — when they were. */
	notes: NoteToken[][] | null;
	/** Why the string-and-fret lists could not be read, when they were there but did not pair up. */
	notesError: string | null;
	/** The right-hand order, when one was written. */
	order: PickToken[] | null;
	/** The order as typed, for the reply. */
	orderText: string | null;
	/** The note value named for the order; null means the default (eighths). */
	duration: Duration | null;
	style: TabStyleEntry | null;
	timeSignature: [number, number] | null;
	bpm: number | null;
	name: string | null;
	capo: number | null;
	/**
	 * What was not read, with nothing else in it. Empty means the whole
	 * sentence was understood — the only state in which it may be acted on.
	 */
	leftover: string;
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** Blank every occurrence of the phrases, longest first; latin words whole only. */
function strip(text: string, phrases: readonly string[]): { text: string; hit: boolean } {
	let hit = false;
	let out = text;
	for (const phrase of [...phrases].sort((a, b) => b.length - a.length)) {
		const pattern = /^[a-z0-9' ]+$/i.test(phrase)
			? new RegExp(`(?<![a-z])${escapeRegExp(phrase)}(?![a-z])`, "gi")
			: new RegExp(escapeRegExp(phrase), "gi");
		if (pattern.test(out)) {
			hit = true;
			out = out.replace(pattern, " ");
		}
	}
	return { text: out, hit };
}

/**
 * The longest run of order words in the sentence: `Am: 5 3 2 1 3 2 1 3` holds
 * one, `C G Am F` holds none. A lone digit is not a run — it is a fret, a
 * count, anything — so a run has at least two beats, and at least one of them
 * plucks something.
 */
function findOrderRun(text: string): { text: string; start: number; end: number } | null {
	const words = [...text.matchAll(/[^\s:,，、;；]+/g)].map((m) => ({
		text: m[0],
		start: m.index,
		end: m.index + m[0].length,
	}));
	let best: { text: string; start: number; end: number; beats: number } | null = null;
	let i = 0;
	while (i < words.length) {
		if (!isOrderWord(words[i].text)) {
			i += 1;
			continue;
		}
		let j = i;
		while (j + 1 < words.length && isOrderWord(words[j + 1].text)) j += 1;
		const run = words.slice(i, j + 1);
		const runText = run.map((w) => w.text).join(" ");
		const parsed = parsePickOrder(runText);
		if (parsed.ok) {
			const beats = parsed.order.length;
			const plucks = parsed.order.some((t) => "strings" in t);
			if (beats >= 2 && plucks && (best === null || beats > best.beats)) {
				best = { text: runText, start: run[0].start, end: run[run.length - 1].end, beats };
			}
		}
		i = j + 1;
	}
	return best;
}

export function readTabSentence(
	original: string,
	index: readonly ChordIndexEntry[],
): TabSentenceReading {
	const { text: afterCapo, capo } = withoutCapo(original);
	const { name, text: afterName } = readName(afterCapo);
	const { bpm, text: afterBpm } = readWrittenBpm(afterName);

	// Strings and frets first: their digits would read as a pick order to
	// everything after this.
	const pairs = readStringFret(afterBpm);
	const notes = pairs.found && pairs.ok ? pairs.groups : null;
	const notesError = pairs.found && !pairs.ok ? pairs.error : null;

	// The meter and the note value before the order: `6/8` and `/16` are made
	// of the same characters as a run, and a `5/4` inside a run is a thumb
	// only because no supported meter is spelled that way.
	let text = pairs.found ? pairs.text : afterBpm;
	let timeSignature: [number, number] | null = null;
	for (const m of text.matchAll(METER_WRITTEN)) {
		const meter: [number, number] = [Number(m[1]), Number(m[2])];
		if (isSupportedMeter(meter) && timeSignature === null) {
			timeSignature = meter;
			text = blankSpan(text, m.index, m.index + m[0].length);
		}
	}
	for (const entry of METER_WORDS) {
		const stripped = strip(text, entry.words);
		if (stripped.hit && timeSignature === null) timeSignature = entry.meter;
		if (stripped.hit) text = stripped.text;
	}

	let duration: Duration | null = null;
	for (const entry of DURATION_WORDS) {
		const stripped = strip(text, entry.words);
		if (stripped.hit && duration === null) duration = entry.duration;
		if (stripped.hit) text = stripped.text;
	}

	const run = findOrderRun(text);
	if (run) text = blankSpan(text, run.start, run.end);
	const order = run ? parsePickOrder(run.text) : null;

	let style: TabStyleEntry | null = null;
	for (const entry of TAB_STYLES) {
		const stripped = strip(text, entry.words);
		if (stripped.hit && style === null) style = entry;
		if (stripped.hit) text = stripped.text;
	}

	// Chords before the noise: "a" is a chord here only where it is written as
	// one, and the noise list would otherwise eat an "A" it should not.
	const chordWords: ChordWord[] = [];
	const chordSpans = [...text.matchAll(CHORD_TOKEN_ANY_CASE)].filter((m) => {
		const before = text[m.index - 1];
		const after = text[m.index + m[0].length];
		return !(before && /[A-Za-z]/.test(before)) && !(after && /[A-Za-z]/.test(after));
	});
	for (const m of chordSpans) {
		const word = m[0];
		// A lone lowercase letter is an article, never a chord; "am" and "g7"
		// are chords a phone keyboard writes.
		const couldBeChord = /^[A-G]/.test(word) || word.length >= 2;
		if (couldBeChord && isExactChord(word, index)) {
			const parsed = parseChordSequence(word, index);
			chordWords.push({ text: word, chord: parsed.chords[0] ?? null });
			text = blankSpan(text, m.index, m.index + word.length);
		} else if (looksLikeChord(word)) {
			// Spelled like a chord, but the library has nothing for it: kept in
			// its place rather than dropped, and said so.
			chordWords.push({ text: word, chord: null });
			text = blankSpan(text, m.index, m.index + word.length);
		}
	}

	text = strip(text.toLowerCase(), NOISE).text;
	const leftover = text.replace(/[\s\p{P}\p{S}]/gu, "");

	return {
		chordWords,
		notes,
		notesError,
		order: order?.ok ? order.order : null,
		orderText: run?.text ?? null,
		duration,
		style,
		timeSignature,
		bpm,
		name,
		capo,
		leftover,
	};
}
