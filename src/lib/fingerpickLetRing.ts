import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { spanIdFor } from "@/lib/fingerpickIndex";

/**
 * A copy of `pattern` with every note under one let-ring span, first slot to
 * last. Pure — never mutates the input.
 *
 * A let ring only affects the audio envelope (a played note rings at the
 * fixed long `letRingDecayTc` τ and is terminated only by voice stealing)
 * and the bracket the stave draws; it does not change note timing or
 * positions.
 */
export function withLetRingAll(pattern: FingerpickPattern): FingerpickPattern {
	const slots = pattern.measures.flatMap((measure) => measure.slots);
	if (slots.length === 0) return pattern;
	const from = slots[0].id;
	const to = slots[slots.length - 1].id;
	const others = (pattern.spans ?? []).filter((span) => span.kind !== "letRing");
	return { ...pattern, spans: [...others, { id: spanIdFor("letRing", from), kind: "letRing", from, to }] };
}
