import { tokenizePickSequence, type PickToken } from "@/lib/fingerpickPickSequence";

/**
 * A right-hand order as typed into a sentence: `5 3 2 1 3 2 1 3`,
 * `6(32)1(32)`, `根3231323`, `5/4 2 1 3`. The editor's Pick box grammar —
 * digits, rests, pinches and the root token — plus one thing a sentence
 * needs that a box does not: an alternating bass.
 *
 * `5/4` says "the thumb takes string 5 this time and string 4 the next", which
 * is what Travis picking is. The order is written out twice — once with each
 * bass string — so `5/4 2 1 3` is the bar `5 2 1 3 4 2 1 3`, and the plain
 * tokenizer never learns about alternation at all.
 */

/** Bass strings only, distinct: a `4/4` here is a meter, not a thumb going nowhere. */
const ALTERNATION = /^([456])\/([456])$/;

/** A word that could be part of an order: digits, rests, pinches (either width), a root, an alternation. */
const ORDER_WORD = /^(?:[0-6\-()（）根Rr]+|[456]\/[456])$/;

export type PickOrderParse =
	| { ok: true; order: PickToken[]; alternated: boolean }
	| { ok: false; error: string };

/** Whether one whitespace-delimited word could belong to a pick order. */
export function isOrderWord(word: string): boolean {
	if (!ORDER_WORD.test(word)) return false;
	const alt = ALTERNATION.exec(word);
	return alt === null || alt[1] !== alt[2];
}

export function parsePickOrder(text: string): PickOrderParse {
	const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
	if (words.length === 0) return { ok: false, error: "Type string numbers, e.g. 5 3 2 1." };
	const stray = words.find((w) => !isOrderWord(w));
	if (stray !== undefined) {
		return { ok: false, error: `"${stray}" isn't a string number, a rest (0 or -) or a pinch.` };
	}

	const alternated = words.some((w) => ALTERNATION.test(w));
	if (!alternated) {
		const plain = tokenizePickSequence(words.join(""));
		return plain.ok ? { ok: true, order: plain.tokens, alternated: false } : plain;
	}

	// One pass per bass string: the first with every thumb on its first
	// string, the second with every thumb on its second.
	const pass = (side: 1 | 2) =>
		tokenizePickSequence(words.map((w) => ALTERNATION.exec(w)?.[side] ?? w).join(""));
	const first = pass(1);
	if (!first.ok) return first;
	const second = pass(2);
	if (!second.ok) return second;
	return { ok: true, order: [...first.tokens, ...second.tokens], alternated: true };
}
