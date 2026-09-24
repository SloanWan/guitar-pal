import { normalizeChordName } from "@/lib/chordSearch";

/**
 * A word spelled the way a chord is — a root and a suffix made of the parts a
 * suffix can be made of. Cmaj13#11 is a chord the player meant; "Give" is
 * not, whatever its first letter says.
 *
 * The digit alternative is a single `\d`, not `\d+`: the outer `*` already
 * repeats it, so `13` is two iterations rather than one. Written the other way
 * a run of n digits has 2^(n-1) ways to split between the two quantifiers, and
 * a word that ends up not matching makes the engine walk every one of them —
 * "C" then 28 digits then a letter took 1.7 s, four times that for every two
 * digits added (#287).
 */
const CHORD_SPELLING =
	/^[A-G][#b♯♭]?(?:maj|min|dim|aug|sus|add|m|M|\+|-|°|ø|Δ|#|b|♯|♭|\d|\/[A-G][#b♯♭]?)*$/;

export function looksLikeChord(word: string): boolean {
	return CHORD_SPELLING.test(word) && normalizeChordName(word) !== null;
}
