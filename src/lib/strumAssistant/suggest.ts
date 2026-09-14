import type { EditIntentExplanation } from "@/lib/strumAssistant/editIntent";
import type { PhraseReading } from "@/lib/strumAssistant/readPhrase";
import { pick, type Lang } from "@/lib/strumAssistant/lang";

/**
 * What to say when nothing read the sentence.
 *
 * A sentence the rules could not read is not sent to a model to be answered
 * anyway — that would hide the miss behind a good-looking reply, and hand the
 * player something they did not ask for. It is answered with what *was* read,
 * turned back into sentences the rules do read, with blanks where the rest
 * goes. The player picks one, fills the blank, and sends it: the fastest way
 * back on the path, and every miss teaches the phrasing.
 *
 * The blank is `___`, and the composer puts the caret on it. The sentences
 * offered are in the player's language, and each one is a sentence the rules
 * read — that is the whole point of offering it.
 */

export const BLANK = "___";

export interface Guidance {
	/** What the assistant says. */
	text: string;
	/** Sentences offered, each ready to be filled in and sent. */
	templates: string[];
}

/** The five things a sentence can ask for, as sentences with blanks. */
const INTENTS: Record<Lang, readonly string[]> = {
	en: [`add ${BLANK} to ${BLANK}`, `C G Am F`, `D DU UD`, `rename ${BLANK} to ${BLANK}`, `delete ${BLANK}`],
	zh: [`把 ${BLANK} 加到 ${BLANK} 里`, `C G Am F`, `D DU UD`, `把 ${BLANK} 改名为 ${BLANK}`, `删掉 ${BLANK}`],
};

/** A style key, as the sentence reader spells it in each language. */
const STYLE_WORD: Record<string, Record<Lang, string>> = {
	folk: { en: "folk", zh: "民谣" },
	pop: { en: "pop", zh: "流行" },
	rock: { en: "rock", zh: "摇滚" },
	ballad: { en: "ballad", zh: "抒情" },
};

function unique(templates: string[]): string[] {
	return [...new Set(templates)];
}

export function suggestFrom(seen: EditIntentExplanation, phrase: PhraseReading, lang: Lang = "en"): Guidance {
	const chords = seen.chordWords.length > 0 ? seen.chordWords : phrase.chordWords;
	const chordLine = chords.join(" ");
	const q = (name: string) => (lang === "zh" ? `「${name}」` : `"${name}"`);
	const attachTo = (what: string, target: string) =>
		pick(lang, `add ${what} to ${target}`, `把 ${what} 加到 ${target} 里`);

	// An instruction that fell short: keep what it said, blank what it did not.
	if (seen.op !== null) {
		const target = seen.matchedName;
		switch (seen.op) {
			case "attach":
				if (chords.length > 0 && target === null) {
					return {
						text: pick(
							lang,
							`Read the chords as ${chordLine}, but not where to put them. One of these?`,
							`和弦读成了 ${chordLine}，但没读到要加到哪。是这个意思吗？`,
						),
						templates: [attachTo(chordLine, BLANK), pick(lang, `make a pattern called ${BLANK} with ${chordLine}`, `${chordLine}，叫 ${BLANK}`)],
					};
				}
				if (chords.length === 0 && target !== null) {
					return {
						text: pick(
							lang,
							`Read that as an edit to ${q(target)}, but no chords came through. Fill them in?`,
							`读成了对${q(target)}的修改，但没读到和弦。填一下？`,
						),
						templates: [attachTo(BLANK, target)],
					};
				}
				return {
					text: pick(
						lang,
						"Read that as adding chords to a pattern, but neither the chords nor the pattern came through.",
						"读成了往 pattern 里加和弦，但和弦和 pattern 都没读到。",
					),
					templates: [attachTo(BLANK, BLANK)],
				};
			case "rename":
				return target === null
					? {
							text: pick(
								lang,
								`Read that as a rename, but not of which pattern. You have ${seen.patternCount}.`,
								`读成了改名，但不知道改哪个。你有 ${seen.patternCount} 个 pattern。`,
							),
							templates: [pick(lang, `rename ${BLANK} to ${BLANK}`, `把 ${BLANK} 改名为 ${BLANK}`)],
						}
					: {
							text: pick(lang, `Rename ${q(target)} — to what?`, `把${q(target)}改名——改成什么？`),
							templates: [pick(lang, `rename ${target} to ${BLANK}`, `把 ${target} 改名为 ${BLANK}`)],
						};
			case "delete":
				return {
					text: pick(
						lang,
						`Read that as a delete, but not of which pattern. You have ${seen.patternCount}.`,
						`读成了删除，但不知道删哪个。你有 ${seen.patternCount} 个 pattern。`,
					),
					templates: [pick(lang, `delete ${BLANK}`, `删掉 ${BLANK}`)],
				};
		}
	}

	// Not an instruction, but something musical was in it.
	if (phrase.notation !== null) {
		const strokes = phrase.notation;
		return {
			text: pick(
				lang,
				`Read the rhythm as ${strokes}. The rest I could not place — one of these?`,
				`节奏读成了 ${strokes}，其余的没读懂。是这个意思吗？`,
			),
			templates: unique([
				strokes,
				chords.length > 0 ? `${chordLine}, ${strokes}` : `${BLANK} ${BLANK} ${BLANK} ${BLANK}, ${strokes}`,
				pick(lang, `${strokes} in ${BLANK} bpm`, `${strokes} ${BLANK} bpm`),
			]),
		};
	}
	if (chords.length >= 2) {
		const style = phrase.style ? STYLE_WORD[phrase.style]?.[lang] : null;
		return {
			text: pick(
				lang,
				`Read the chords as ${chordLine}. The rest I could not place — one of these?`,
				`和弦读成了 ${chordLine}，其余的没读懂。是这个意思吗？`,
			),
			templates: unique([
				chordLine,
				`${chordLine}, D DU UD`,
				attachTo(chordLine, BLANK),
				...(style ? [`${chordLine} ${style}`] : []),
			]),
		};
	}
	if (phrase.style !== null || phrase.tempo !== null) {
		const feel = [
			phrase.style ? STYLE_WORD[phrase.style]?.[lang] : null,
			phrase.tempo === "slower" ? pick(lang, "slow", "慢一点") : phrase.tempo === "faster" ? pick(lang, "fast", "快一点") : null,
		]
			.filter((w): w is string => typeof w === "string")
			.join(" ");
		return {
			text: pick(
				lang,
				`Read "${feel}", and nothing else I could use. Name the chords, or the rhythm?`,
				`读到了「${feel}」，别的用不上。和弦或节奏是什么？`,
			),
			templates: [`${feel} ${BLANK}`, `${feel}, ${BLANK} ${BLANK} ${BLANK} ${BLANK}`],
		};
	}

	// Only a name. Offer the sentences it could be the name of.
	if (phrase.name !== null) {
		const named = pick(lang, `name it ${phrase.name}`, `叫 ${phrase.name}`);
		return {
			text: pick(
				lang,
				`Read the name as ${q(phrase.name)}, and nothing to give it to yet. Chords, or a rhythm?`,
				`名字读成了${q(phrase.name)}，但还没有东西可以叫这个名。和弦，还是节奏？`,
			),
			templates: [`${BLANK} ${BLANK} ${BLANK} ${BLANK}, ${named}`, `${BLANK}, ${named}`],
		};
	}

	// Nothing at all. Ask what was meant, as sentences.
	return {
		text: pick(
			lang,
			"I didn't get that. Pick what you meant and fill in the blanks — chords, a rhythm, or a change to a pattern you have.",
			"没读懂。选一个你想做的，把空填上——和弦、节奏，或者改你已有的 pattern。",
		),
		templates: [...INTENTS[lang]],
	};
}
