import { normalizeChordName } from "@/lib/chordSearch";

/**
 * A word spelled the way a chord is — a root and a suffix made of the parts a
 * suffix can be made of. Cmaj13#11 is a chord the player meant; "Give" is
 * not, whatever its first letter says.
 */
const CHORD_SPELLING =
	/^[A-G][#b♯♭]?(?:maj|min|dim|aug|sus|add|m|M|\+|-|°|ø|Δ|#|b|♯|♭|\d+|\/[A-G][#b♯♭]?)*$/;

export function looksLikeChord(word: string): boolean {
	return CHORD_SPELLING.test(word) && normalizeChordName(word) !== null;
}
