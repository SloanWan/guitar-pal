import { normalizeChordName, type ChordIndexEntry } from "@/lib/chordSearch";
import { UNKNOWN_ROOT } from "@/lib/chordSuffixes";
import { chordAbbreviation } from "@/lib/strumProgressions";
import type { ChordRef } from "@/lib/strumPatterns";
import { pick, type Lang } from "@/lib/assistant/lang";

/**
 * A question about chord shapes — "how do I play F#m7", "C和弦怎么按",
 * "show me C Am F G" — read without a model, in either language.
 *
 * Shared by both rules assistants and by General's `show_chord` tool: which
 * chords are asked about is the same question on every page, and the answer
 * is the same card. The reader is deliberately narrow — a fixed set of asking
 * phrases around a run of chord words, and nothing else in the sentence — so
 * a bare chord line, an edit or a pattern request never reads as an ask: on
 * the strum page "C Am F G" is a progression, and "show me C Am F G" is a
 * question about four shapes.
 *
 * Every chord word is matched *exactly* against the index, never through the
 * ranked search the chord picker uses: that search turns "for" into F and
 * "do" into D, which is right for a search box and wrong for a sentence.
 */

export interface ChordAsk {
	/** The chords asked about, in the order written, as the library stores them. */
	chords: ChordRef[];
	/** The words the player wrote for them. */
	words: string[];
}

/**
 * A word as a chord name: a root letter, an accidental, whatever a suffix is
 * spelled with, and an optional slash bass. Case-insensitive on the root so a
 * phone's autocapitalisation, or its lack, makes no difference. The nouns an
 * ask ends in ("chord", "shape", "fingering") begin with note letters too, so
 * they are kept out of the word by name; the exact match would refuse them
 * anyway, but a run is read whole, and one refused word fails the run. An
 * article before such a noun is not the chord A either.
 */
const CHORD_WORD = String.raw`(?!(?:chords?|shapes?|fingerings?|voicings?|diagrams?|grips?|and|for|do|be)\b)(?!an?\s+(?:chords?|shapes?|fingerings?|voicings?|diagrams?|grips?)\b)[A-Ga-g](?:[#b♯♭])?[A-Za-z0-9+°ø()#♯♭Δ∆]*(?:/[A-Ga-g][#b♯♭]?)?`;
/** One chord word or several: "C Am F G", "C, G, Am", "C-G-Am-F". */
const CHORD_RUN = String.raw`(${CHORD_WORD}(?:[\s,，、\-–—]+${CHORD_WORD})*)`;
const RUN_SEPARATOR = /[\s,，、\-–—]+/;

/** Trailing punctuation a question wears. */
const TRAILING = /[\s?？!！.。]+$/;

/**
 * English: an asking phrase before the chords, a noun after them, or both.
 * "show me Bm", "how do I play an F chord", "Cmaj7 fingering", "F chord",
 * "show me C Am F G", "C G Am F chord shapes". A bare verb ("play C G") is
 * not an ask: on the strum page that is as likely a request for a pattern.
 */
const EN_LEAD = String.raw`(?:(?:how|where)\s+(?:do|can|should|would)\s+(?:i|you|we|one)\s+(?:play|finger|hold|fret|form|make)|how\s+to\s+(?:play|finger|hold|fret|form|make)|(?:can\s+you\s+|please\s+)?show(?:\s+me)?|(?:what(?:'s|\s+is|\s+are)\s+)?(?:the\s+)?(?:shape|fingering|voicing|fingers|grip|diagram)s?\s+(?:of|for)|what(?:'s|\s+is)|where\s+(?:do\s+)?(?:my\s+)?fingers\s+go\s+(?:on|for))`;
const EN_NOUN = String.raw`(?:chord|shape|fingering|voicing|diagram|grip)s?`;
const EN_WITH_LEAD = new RegExp(String.raw`^${EN_LEAD}\s+(?:an?\s+|the\s+|these\s+)?${CHORD_RUN}(?:\s+chords?)?(?:\s+${EN_NOUN})?$`, "i");
const EN_WITH_NOUN = new RegExp(String.raw`^(?:an?\s+|the\s+)?${CHORD_RUN}\s+${EN_NOUN}(?:\s+${EN_NOUN})?$`, "i");

/**
 * Chinese: a looking-up verb before the chords, or an asking clause after them.
 * "看看 Am", "C和弦怎么按", "F#m7 的指法", "怎么弹 G", "Bm 和弦", "C G Am F 的指法".
 */
const ZH_POLITE = String.raw`(?:请问|请|帮我|给我|我想|想)?\s*`;
const ZH_LOOK = String.raw`(?:看看|看一下|看下|显示|展示|查一下|查下|查|找一下|找|给我看|来个|来一个)`;
const ZH_NOUN = String.raw`(?:指法|手型|手形|按法|按法图|指型|和弦图|图)`;
const ZH_HOW = String.raw`(?:怎么|怎样|如何|咋|该怎么|要怎么|应该怎么)\s*(?:按|弹|压|按呢|弹呢)`;
const ZH_TAIL = String.raw`\s*(?:啊|呢|呀|吗|的)?`;
const ZH_WITH_LOOK = new RegExp(String.raw`^${ZH_POLITE}${ZH_LOOK}\s*(?:这几个|这些|这)?\s*${CHORD_RUN}\s*(?:和弦|这几个和弦|这些和弦)?(?:的)?(?:${ZH_NOUN})?${ZH_TAIL}$`);
const ZH_WITH_CLAUSE = new RegExp(String.raw`^${ZH_POLITE}${CHORD_RUN}\s*(?:和弦|这几个和弦|这些和弦)?\s*(?:的)?\s*(?:${ZH_HOW}|${ZH_NOUN}|和弦)${ZH_TAIL}$`);
const ZH_HOW_FIRST = new RegExp(String.raw`^${ZH_POLITE}${ZH_HOW}\s*${CHORD_RUN}\s*(?:和弦|这几个和弦|这些和弦)?${ZH_TAIL}$`);

const FORMS: readonly RegExp[] = [EN_WITH_LEAD, EN_WITH_NOUN, ZH_WITH_LOOK, ZH_WITH_CLAUSE, ZH_HOW_FIRST];

/**
 * The chord a word names, exactly. Spelling is normalised the way the search
 * box normalises it (Cmaj7 and Cmajor7 are one chord; D# and Eb are one
 * root) but the result has to be a chord the library holds under that name
 * — no nearest match.
 */
export function exactChord(word: string, index: readonly ChordIndexEntry[]): ChordRef | null {
	const name = normalizeChordName(word);
	if (name === null || name.root === UNKNOWN_ROOT) return null;
	const hit = index.find((e) => e.root === name.root && e.suffix === name.suffix);
	return hit ? { root: hit.root, suffix: hit.suffix, voicingId: null } : null;
}

/**
 * The chords one sentence asks the shapes of, or null when it asks nothing
 * of the kind — or names a word the library has no chord for: an ask with a
 * hole in it is answered as a miss, which says so, rather than with the
 * chords around the hole.
 */
export function readChordAsk(text: string, index: readonly ChordIndexEntry[]): ChordAsk | null {
	const sentence = text.trim().replace(TRAILING, "");
	if (sentence === "") return null;
	for (const form of FORMS) {
		const m = form.exec(sentence);
		if (!m) continue;
		const words = m[1].split(RUN_SEPARATOR).filter((w) => w !== "");
		const chords: ChordRef[] = [];
		for (const word of words) {
			const chord = exactChord(word, index);
			if (!chord) return null;
			chords.push(chord);
		}
		if (chords.length > 0) return { chords, words };
	}
	return null;
}

/** What the assistant says over the card. */
export function chordAskReply(ask: ChordAsk, lang: Lang): string {
	const labels = ask.chords.map(chordAbbreviation);
	if (labels.length === 1) {
		return pick(
			lang,
			`Here is ${labels[0]}. The arrows step through every shape the library has for it; its page has them all at once.`,
			`${labels[0]} 的指法在下面。箭头切换库里的每一种按法，和弦页能一次看全。`,
		);
	}
	return pick(
		lang,
		`Here are ${labels.join(", ")}. Each has arrows through its shapes; the grid page shows all ${labels.length} side by side.`,
		`${labels.join("、")} 的指法在下面。每个都能用箭头切换按法，网格页可以把这 ${labels.length} 个并排看。`,
	);
}
