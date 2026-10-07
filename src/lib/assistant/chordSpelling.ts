import { normalizeChordName } from "@/lib/chordSearch";

/**
 * A word spelled the way a chord is — a root and a suffix made of the parts a
 * suffix can be made of. Cmaj13#11 is a chord the player meant; "Give" is
 * not, whatever its first letter says.
 *
 * Every alternative below matches a fixed span that no other alternative can
 * also claim, which is what keeps the `*` from backtracking. Two of them used
 * not to, and each gave a word that fails to match 2^n ways to be parsed (#287):
 *
 *   - `\d+` took a whole digit run, which the outer `*` could equally take in
 *     pieces. A single `\d` leaves all the repeating to the `*`, so `13` is two
 *     iterations rather than one.
 *   - `\/[A-G][#b♯♭]?` ended in an optional accidental that `#`, `b`, `♯` and
 *     `♭` can each match on their own in the next iteration. Dropping it still
 *     spells `G/F#`, now as `/F` then `#`.
 */
const CHORD_SPELLING =
	/^[A-G][#b♯♭]?(?:maj|min|dim|aug|sus|add|m|M|\+|-|°|ø|Δ|#|b|♯|♭|\d|\/[A-G])*$/;

export function looksLikeChord(word: string): boolean {
	return CHORD_SPELLING.test(word) && normalizeChordName(word) !== null;
}
