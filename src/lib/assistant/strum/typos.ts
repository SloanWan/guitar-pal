import type { NamedPattern } from "@/lib/lastPattern";
import { NEW_NAME } from "@/lib/assistant/strum/editIntent";
import { correctKeywords, wordsOf, type Correction, type LexiconEntry } from "@/lib/assistant/fuzzy";
import { STYLES, readName } from "@/lib/assistant/strum/readPhrase";

/**
 * The strum assistant's typo pass: the words its readers know, corrected
 * before any of them read. What is never corrected is anything the player
 * is naming — a pattern they have, or the name they are giving one — since
 * a name is spelled however its owner spells it.
 */

const LEXICON: readonly LexiconEntry[] = [
	...STYLES.flatMap((s) => s.words.map((word) => ({ word }))),
	...["slower", "slowly", "slow", "faster", "fast", "quick", "upbeat"].map((word) => ({ word })),
	...["delete", "remove", "rename", "attach", "append", "重命名"].map((word) => ({ word })),
	...["strum", "strumming", "pattern", "progression", "chords", "capo"].map((word) => ({ word })),
];

export function correctStrumTypos(
	text: string,
	patterns: readonly NamedPattern[],
): { text: string; corrections: Correction[] } {
	const named = readName(text).name;
	const renamed = NEW_NAME.exec(text)?.[1] ?? null;
	const keep = [
		...wordsOf(patterns.map((p) => p.name)),
		...wordsOf([named ?? "", renamed ?? ""]),
	];
	return correctKeywords(text, LEXICON, { keep });
}
