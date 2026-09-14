import type { FingerpickPattern, Measure } from "./fingerpickTypes";
import type { SlotTarget } from "./fingerpickEdit";
import type { ChordRef } from "./strumPatterns";
import { chordAbbreviation } from "./strumProgressions";

/**
 * The chord in effect at every slot, index-aligned with `measures[i].slots[j]`.
 *
 * A mark holds until the next one, across measure boundaries — a lead sheet
 * writes a chord once and lets it run — so `null` only ever appears before the
 * first mark. This is the single read path for "which chord is this slot
 * under"; nothing else should walk the marks itself.
 */
export function effectiveChords(measures: readonly Measure[]): (ChordRef | null)[][] {
	let current: ChordRef | null = null;
	return measures.map((measure) =>
		measure.slots.map((slot) => {
			if (slot.chord) current = slot.chord;
			return current;
		}),
	);
}

/** Whether any slot carries a chord mark — what decides if a chord line is drawn at all. */
export function patternHasChords(measures: readonly Measure[]): boolean {
	return measures.some((measure) => measure.slots.some((slot) => slot.chord !== undefined));
}

/**
 * Put a chord change on a slot, or take it away (`null`). Removing a mark does
 * not silence the region: the previous chord simply runs on through it.
 */
export function setSlotChord(
	pattern: FingerpickPattern,
	target: SlotTarget,
	chord: ChordRef | null,
): FingerpickPattern {
	return {
		...pattern,
		measures: pattern.measures.map((measure, mi) =>
			mi !== target.measureIndex
				? measure
				: {
						...measure,
						slots: measure.slots.map((slot, si) => {
							if (si !== target.slotIndex) return slot;
							const { chord: _chord, ...rest } = slot;
							void _chord;
							return chord ? { ...rest, chord } : rest;
						}),
					},
		),
	};
}

/**
 * The symbol written above the stave for a chord: `C`, `Am`, `G7`, `F#m7b5` —
 * the lead-sheet spelling, without the space the browse pages put between root
 * and quality.
 */
export function chordSymbolLabel(chord: ChordRef): string {
	return chordAbbreviation(chord);
}
