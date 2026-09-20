import { normalizeChordName, type ChordIndexEntry } from "@/lib/chordSearch";
import { UNKNOWN_ROOT } from "@/lib/chordSuffixes";
import { chordAbbreviation } from "@/lib/strumProgressions";
import type { ChordRef } from "@/lib/strumPatterns";
import { pick, type Lang } from "@/lib/assistant/lang";

/**
 * A question about one chord's shape — "how do I play F#m7", "C和弦怎么按",
 * "show me Bm" — read without a model, in either language.
 *
 * Shared by both rules assistants and by General's `show_chord` tool: which
 * chord is asked about is the same question on every page, and the answer is
 * the same card. The reader is deliberately narrow — a fixed set of asking
 * phrases around exactly one chord word, and nothing else in the sentence —
 * so a chord line, an edit or a pattern request never reads as an ask.
 *
 * The chord word is matched *exactly* against the index, never through the
 * ranked search the chord picker uses: that search turns "for" into F and
 * "do" into D, which is right for a search box and wrong for a sentence.
 */

export interface ChordAsk {
	/** The chord asked about, as the library stores it. */
	chord: ChordRef;
	/** The word the player wrote for it. */
	word: string;
}

/**
 * A word as a chord name: a root letter, an accidental, whatever a suffix is
 * spelled with, and an optional slash bass. Case-insensitive on the root so a
 * phone's autocapitalisation, or its lack, makes no difference.
 */
const CHORD_WORD = String.raw`([A-Ga-g](?:[#b♯♭])?[A-Za-z0-9+°ø()#♯♭Δ∆-]*(?:/[A-Ga-g][#b♯♭]?)?)`;

/** Trailing punctuation a question wears. */
const TRAILING = /[\s?？!！.。]+$/;

/**
 * English: an asking phrase before the chord, a noun after it, or both.
 * "show me Bm", "how do I play an F chord", "Cmaj7 fingering", "F chord".
 */
const EN_LEAD = String.raw`(?:(?:how|where)\s+(?:do|can|should|would)\s+(?:i|you|we|one)\s+(?:play|finger|hold|fret|form|make)|how\s+to\s+(?:play|finger|hold|fret|form|make)|(?:can\s+you\s+|please\s+)?show(?:\s+me)?|(?:what(?:'s|\s+is)\s+)?(?:the\s+)?(?:shape|fingering|voicing|fingers|grip|diagram)s?\s+(?:of|for)|what(?:'s|\s+is)|where\s+(?:do\s+)?(?:my\s+)?fingers\s+go\s+(?:on|for)|(?:play|finger|hold|fret|form))`;
const EN_NOUN = String.raw`(?:chord|shape|fingering|voicing|diagram|grip)s?`;
const EN_WITH_LEAD = new RegExp(String.raw`^${EN_LEAD}\s+(?:an?\s+|the\s+)?${CHORD_WORD}(?:\s+chord)?(?:\s+${EN_NOUN})?$`, "i");
const EN_WITH_NOUN = new RegExp(String.raw`^(?:an?\s+|the\s+)?${CHORD_WORD}\s+${EN_NOUN}(?:\s+${EN_NOUN})?$`, "i");

/**
 * Chinese: a looking-up verb before the chord, or an asking clause after it.
 * "看看 Am", "C和弦怎么按", "F#m7 的指法", "怎么弹 G", "Bm 和弦".
 */
const ZH_POLITE = String.raw`(?:请问|请|帮我|给我|我想|想)?\s*`;
const ZH_LOOK = String.raw`(?:看看|看一下|看下|显示|展示|查一下|查下|查|找一下|找|给我看|来个|来一个)`;
const ZH_NOUN = String.raw`(?:指法|手型|手形|按法|按法图|指型|和弦图|图)`;
const ZH_HOW = String.raw`(?:怎么|怎样|如何|咋|该怎么|要怎么|应该怎么)\s*(?:按|弹|压|按呢|弹呢)`;
const ZH_TAIL = String.raw`\s*(?:啊|呢|呀|吗|的)?`;
const ZH_WITH_LOOK = new RegExp(String.raw`^${ZH_POLITE}${ZH_LOOK}\s*${CHORD_WORD}\s*(?:和弦)?(?:的)?(?:${ZH_NOUN})?${ZH_TAIL}$`);
const ZH_WITH_CLAUSE = new RegExp(String.raw`^${ZH_POLITE}${CHORD_WORD}\s*(?:和弦)?\s*(?:的)?\s*(?:${ZH_HOW}|${ZH_NOUN}|和弦)${ZH_TAIL}$`);
const ZH_HOW_FIRST = new RegExp(String.raw`^${ZH_POLITE}${ZH_HOW}\s*${CHORD_WORD}\s*(?:和弦)?${ZH_TAIL}$`);

const FORMS: readonly RegExp[] = [EN_WITH_LEAD, EN_WITH_NOUN, ZH_WITH_LOOK, ZH_WITH_CLAUSE, ZH_HOW_FIRST];

/**
 * The chord a word names, exactly. Spelling is normalised the way the search
 * box normalises it (Cmaj7, CM7 and Cmajor7 are one chord; D# and Eb are
 * one root) but the result has to be a chord the library holds under that
 * name — no nearest match.
 */
export function exactChord(word: string, index: readonly ChordIndexEntry[]): ChordRef | null {
	const name = normalizeChordName(word);
	if (name === null || name.root === UNKNOWN_ROOT) return null;
	const hit = index.find((e) => e.root === name.root && e.suffix === name.suffix);
	return hit ? { root: hit.root, suffix: hit.suffix, voicingId: null } : null;
}

/** The chord one sentence asks the shape of, or null when it asks nothing of the kind. */
export function readChordAsk(text: string, index: readonly ChordIndexEntry[]): ChordAsk | null {
	const sentence = text.trim().replace(TRAILING, "");
	if (sentence === "") return null;
	for (const form of FORMS) {
		const m = form.exec(sentence);
		if (!m) continue;
		const chord = exactChord(m[1], index);
		if (chord) return { chord, word: m[1] };
	}
	return null;
}

/** What the assistant says over the card. */
export function chordAskReply(ask: ChordAsk, lang: Lang): string {
	const label = chordAbbreviation(ask.chord);
	return pick(
		lang,
		`Here is ${label}. The arrows step through every shape the library has for it; its page has them all at once.`,
		`${label} 的指法在下面。箭头切换库里的每一种按法，和弦页能一次看全。`,
	);
}
