import { looksLikeChord } from "@/lib/tabAssistant/chordSpelling";

/**
 * Typos in the words the reader knows, corrected before it reads.
 *
 * A player typing at the instrument writes `strng:` and `travs picking`,
 * and a reader that refuses those is not reading, it is proofreading. So
 * every latin word is compared with the lexicon by edit distance — one
 * character wrong in a short word, two in a long one — and a near miss is
 * taken as the word it is nearest to. Chinese words the same way, one
 * character off across a window the width of the word.
 *
 * Two things are never corrected: chord names, where a near miss is a
 * different chord and not a typo; and words that need a colon-and-digits
 * after them (`string:`, `fret:`) unless the digits are there, so a
 * sentence with the word "strong" in it stays what it says.
 */

export interface Correction {
	from: string;
	to: string;
}

export interface LexiconEntry {
	word: string;
	/** Only corrected when what follows is a list of digits — the clause keywords. */
	beforeDigits?: boolean;
}

/** Damerau–Levenshtein with adjacent transpositions (optimal string alignment). */
export function editDistance(a: string, b: string): number {
	const rows = a.length + 1;
	const cols = b.length + 1;
	const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
	for (let i = 0; i < rows; i++) d[i][0] = i;
	for (let j = 0; j < cols; j++) d[0][j] = j;
	for (let i = 1; i < rows; i++) {
		for (let j = 1; j < cols; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
			}
		}
	}
	return d[a.length][b.length];
}

/** How many characters a latin word of this length may have wrong. */
function tolerance(length: number): number {
	if (length < 4) return 0;
	return length <= 6 ? 1 : 2;
}

const LATIN_WORD = /[A-Za-z]+/g;
const CJK = /[一-鿿]/;
const ALL_CJK = /^[一-鿿]+$/;
const DIGITS_AFTER = /^\s*[:：]?\s*\d/;

function nearest(word: string, candidates: readonly string[]): { word: string; distance: number } | null {
	let best: { word: string; distance: number } | null = null;
	for (const candidate of candidates) {
		const distance = editDistance(word, candidate);
		if (best === null || distance < best.distance) best = { word: candidate, distance };
	}
	return best;
}

export function correctKeywords(
	text: string,
	lexicon: readonly LexiconEntry[],
): { text: string; corrections: Correction[] } {
	const corrections: Correction[] = [];
	const latin = lexicon.filter((e) => !CJK.test(e.word));
	const cjk = lexicon.filter((e) => CJK.test(e.word));

	let out = text;

	// Latin words, whole ones only, longest lexicon match wins on a tie.
	out = out.replace(LATIN_WORD, (word, offset: number) => {
		if (tolerance(word.length) === 0) return word;
		const lower = word.toLowerCase();
		if (latin.some((e) => e.word === lower)) return word;
		if (looksLikeChord(word)) return word;
		const after = text.slice(offset + word.length);
		const eligible = latin.filter((e) => !e.beforeDigits || DIGITS_AFTER.test(after));
		const hit = nearest(lower, eligible.map((e) => e.word));
		if (!hit || hit.distance === 0 || hit.distance > tolerance(word.length)) return word;
		// A word that is only a typo of the lexicon word when both are short
		// still has to share more than it differs: "free" is not "fret".
		if (hit.distance > tolerance(hit.word.length)) return word;
		corrections.push({ from: word, to: hit.word });
		return hit.word;
	});

	// Chinese: a window the width of a lexicon word, one character off. A
	// window may not overlap a word that is already spelled right — "三拍子"
	// is not a typo of "二拍子", and the "六分音符" inside "十六分音符" is not a
	// typo of "八分音符" — and the nearest word has to be nearest alone.
	const exact: [number, number][] = [];
	for (const entry of [...cjk].sort((a, b) => b.word.length - a.word.length)) {
		let at = out.indexOf(entry.word);
		while (at !== -1) {
			if (!exact.some(([s, e]) => at < e && at + entry.word.length > s)) exact.push([at, at + entry.word.length]);
			at = out.indexOf(entry.word, at + 1);
		}
	}
	const overlapsExact = (start: number, end: number) => exact.some(([s, e]) => start < e && end > s);
	const widths = [...new Set(cjk.map((e) => e.word.length).filter((w) => w >= 3))].sort((a, b) => b - a);
	for (const width of widths) {
		const candidates = cjk.filter((e) => e.word.length === width);
		for (let i = 0; i + width <= out.length; i++) {
			if (overlapsExact(i, i + width)) continue;
			const window = out.slice(i, i + width);
			// Whole characters only: a space is never a typo of a character.
			if (!ALL_CJK.test(window)) continue;
			const ranked = candidates
				.map((e) => ({ entry: e, distance: editDistance(window, e.word) }))
				.sort((a, b) => a.distance - b.distance);
			const best = ranked[0];
			if (!best || best.distance !== 1 || (ranked[1] && ranked[1].distance === 1)) continue;
			if (best.entry.beforeDigits && !DIGITS_AFTER.test(out.slice(i + width))) continue;
			corrections.push({ from: window, to: best.entry.word });
			out = out.slice(0, i) + best.entry.word + out.slice(i + width);
			exact.push([i, i + width]);
		}
	}

	return { text: out, corrections };
}
