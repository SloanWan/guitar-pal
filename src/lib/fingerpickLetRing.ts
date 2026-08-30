import type { BeatSlot, FingerpickPattern } from "@/lib/fingerpickTypes";

/**
 * Return a deep copy of `pattern` with `letRing: true` forced on every string of
 * every slot. Pure — never mutates the input.
 *
 * `letRing` only affects the audio envelope (a played note rings at the fixed
 * long `letRingDecayTc` τ and is terminated only by voice stealing); it does not
 * change note timing, positions, or the rendered notation. Strings that are not
 * actually played in a slot (fret === null and not muted) still carry the flag
 * but produce no event, so the flag is a no-op there.
 */
export function withLetRingAll(pattern: FingerpickPattern): FingerpickPattern {
	return {
		...pattern,
		measures: pattern.measures.map((measure) => ({
			...measure,
			slots: measure.slots.map((slot) => ({
				...slot,
				strings: slot.strings.map((sf) => ({ ...sf, letRing: true })) as BeatSlot["strings"],
			})),
		})),
	};
}
