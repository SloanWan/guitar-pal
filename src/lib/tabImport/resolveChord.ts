import { exactChord, normalizeChordName, searchChords, type ChordIndexEntry } from "@/lib/chordSearch";
import { UNKNOWN_ROOT, isBrowsableSuffix } from "@/lib/chordSuffixes";
import { NO_CHORD, isNoChordWord } from "@/lib/fingerpickChords";
import type { ChordRef } from "@/lib/strumPatterns";
import type { ValidationIssue } from "./types";

/**
 * Printed chord names onto the slots they stand over (#427). Two importers
 * read a chord as a word: `import_tab`, and the book service, whose draft
 * slots carry `chordName` for the validate route to turn into a `chord`
 * before the validator — which keeps only a `chord` object — ever sees it.
 */

// A number alone is not a chord: the ranked search would hand back its
// nearest suffix ("5" → C maj7#5), the way it would for a pick order.
const BARE_NUMBER = /^\d+$/;

/**
 * The chord a printed word names: N.C.; the library's chord of that name; a
 * chord of a kind the library knows whose root it happens not to carry (the
 * tables hold only C#5 and F#5 of the power chords, and the books print E5 —
 * the nearest match would be Emaj7#5); else the picker's best match, so "a
 * minor 7" still lands. Null when nothing reads as a chord.
 */
export function resolveChordName(word: string, index: readonly ChordIndexEntry[]): ChordRef | null {
	const name = word.trim();
	if (name === "") return null;
	if (isNoChordWord(name)) return NO_CHORD;
	const exact = exactChord(name, index);
	if (exact) return exact;
	if (BARE_NUMBER.test(name)) return null;
	const spelled = normalizeChordName(name);
	if (spelled && spelled.root !== UNKNOWN_ROOT && isBrowsableSuffix(spelled.suffix)) {
		return { root: spelled.root, suffix: spelled.suffix, voicingId: null };
	}
	const first = searchChords(index, name, 1)[0];
	return first ? { root: first.root, suffix: first.suffix, voicingId: null } : null;
}

function slotsOf(raw: unknown): Record<string, unknown>[][] {
	if (typeof raw !== "object" || raw === null) return [];
	const measures = (raw as { measures?: unknown }).measures;
	if (!Array.isArray(measures)) return [];
	return measures.map((m) => {
		const slots = typeof m === "object" && m !== null ? (m as { slots?: unknown }).slots : null;
		return Array.isArray(slots)
			? slots.filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
			: [];
	});
}

/** Whether any slot of a raw draft names its chord as a word. */
export function hasChordNames(raw: unknown): boolean {
	return slotsOf(raw).some((slots) => slots.some((s) => typeof s.chordName === "string"));
}

/**
 * A raw draft with each slot's `chordName` turned into its `chord`, and the
 * key gone. A name the library does not hold is left off the slot with an
 * `UNKNOWN_CHORD` warning whose `original` is the word, so the caller can
 * keep it where the player sees it. A slot that already has a `chord` keeps it.
 */
export function resolveDraftChordNames(
	raw: unknown,
	index: readonly ChordIndexEntry[],
): { draft: unknown; warnings: ValidationIssue[] } {
	if (!hasChordNames(raw)) return { draft: raw, warnings: [] };
	const warnings: ValidationIssue[] = [];
	const draft = raw as { measures: unknown[] };
	const measures = draft.measures.map((m, mi) => {
		if (typeof m !== "object" || m === null) return m;
		const slots = (m as { slots?: unknown }).slots;
		if (!Array.isArray(slots)) return m;
		return {
			...m,
			slots: slots.map((s, si) => {
				if (typeof s !== "object" || s === null || !("chordName" in s)) return s;
				const { chordName, ...slot } = s as Record<string, unknown>;
				if (typeof chordName !== "string" || chordName.trim() === "" || slot.chord) return slot;
				const chord = resolveChordName(chordName, index);
				if (chord) return { ...slot, chord };
				warnings.push({
					code: "UNKNOWN_CHORD",
					path: `measures[${mi}].slots[${si}].chordName`,
					message: `Bar ${mi + 1}: the library has no chord called "${chordName}"; the mark was left off.`,
					original: chordName,
				});
				return slot;
			}),
		};
	});
	return { draft: { ...draft, measures }, warnings };
}
