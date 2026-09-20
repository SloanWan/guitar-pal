import { STRUM_CAPO_MAX } from "@/lib/strumPatterns";

/**
 * A capo, written into a sentence.
 *
 * "capo 2", "capo on the 3rd fret", "变调夹 2 品", "夹三品", "no capo". It is
 * read as a clause and blanked out, so the number is not left over and the word
 * is not read as anything else. A capo belongs to a progression — the chords
 * are what it transposes — so a sentence with a capo and no chords still reads,
 * but the capo has nothing to sit on and is said to be dropped.
 */

const CN_DIGITS: Record<string, number> = {
	零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
	十一: 11, 十二: 12,
};

/** Every way a fret number is written in either language, captured as one group. */
const NUMBER = "(\\d{1,2}|十[一二]?|[零一二两三四五六七八九])";

const CAPO_CLAUSES: readonly RegExp[] = [
	// capo 2 · capo on 2 · capo at the 2nd fret · capo: 2
	new RegExp(`\\bcapo\\s*:?\\s*(?:on|at)?\\s*(?:the)?\\s*${NUMBER}(?:st|nd|rd|th)?(?:\\s*fret)?`, "i"),
	// 2nd fret capo · capo on fret 2
	new RegExp(`\\b${NUMBER}(?:st|nd|rd|th)?\\s*fret\\s*capo`, "i"),
	new RegExp(`\\bcapo\\s*(?:on|at)?\\s*(?:the)?\\s*fret\\s*${NUMBER}`, "i"),
	// 变调夹 2 品 · 变调夹夹在第 2 品 · 夹二品 · 二品变调夹
	new RegExp(`(?:变调夹|移调夹|夹)\\s*(?:夹在|在)?\\s*(?:第)?\\s*${NUMBER}\\s*品?`),
	new RegExp(`(?:第)?\\s*${NUMBER}\\s*品\\s*(?:的)?\\s*(?:变调夹|移调夹)`),
];

/** "no capo" is a capo too: the one at the nut. */
const NO_CAPO = /\bno\s+capo\b|without\s+(?:a\s+)?capo|不(?:用|要|带|加)\s*变调夹|没有变调夹|无变调夹/i;

export interface CapoReading {
	capo: number;
	/** Where the clause sat, so the caller can blank it. */
	start: number;
	end: number;
}

function toNumber(raw: string): number | null {
	if (/^\d+$/.test(raw)) return Number(raw);
	return CN_DIGITS[raw] ?? null;
}

export function readCapo(input: string): CapoReading | null {
	const none = NO_CAPO.exec(input);
	if (none) return { capo: 0, start: none.index, end: none.index + none[0].length };

	for (const clause of CAPO_CLAUSES) {
		const found = clause.exec(input);
		if (!found) continue;
		const fret = toNumber(found[1]);
		if (fret === null || fret < 0 || fret > STRUM_CAPO_MAX) continue;
		return { capo: fret, start: found.index, end: found.index + found[0].length };
	}
	return null;
}

/** The input with a capo clause blanked, and what it said. */
export function withoutCapo(input: string): { text: string; capo: number | null } {
	const read = readCapo(input);
	if (!read) return { text: input, capo: null };
	return {
		text: input.slice(0, read.start) + " ".repeat(read.end - read.start) + input.slice(read.end),
		capo: read.capo,
	};
}
