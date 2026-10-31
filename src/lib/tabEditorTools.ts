import type { Duration, FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import {
	NOTE_LADDER,
	isTripletDuration,
	measureCapacity,
	mergeSlots,
	mergeTargetsForSlot,
	slotDurationUnits,
	splitSlot,
	splitTargetsForSlot,
	tripletForPlainValue,
	tripletPlainValue,
	usedUnits,
	withMeasures,
	type SlotTarget,
} from "@/lib/fingerpickEdit";
import { isCompound } from "@/lib/strumMeter";

/**
 * The editor toolbar's note values (#361). A bar always adds up, so a slot's
 * value changes the way the grid always changed it: split into smaller notes
 * that fill the same time, or merged with the notes after it into a longer one.
 * A value neither reaches is offered disabled, with the reason.
 */

export type DurationChoice =
	| { duration: Duration; kind: "current" }
	| { duration: Duration; kind: "split"; count: number }
	| { duration: Duration; kind: "merge"; count: number }
	| { duration: Duration; kind: "off"; reason: string };

function reasonFor(slotDuration: Duration, target: Duration): string {
	const from = slotDurationUnits(slotDuration);
	const to = slotDurationUnits(target);
	if (to < from) return "Doesn't divide this note evenly, or there is no room left in the bar";
	return "The notes after this one don't add up to it";
}

/** What each of the toolbar's values would do to the slot at the cursor. */
export function durationChoices(pattern: FingerpickPattern, target: SlotTarget): DurationChoice[] {
	const measure = pattern.measures[target.measureIndex];
	const slot = measure?.slots[target.slotIndex];
	if (!measure || !slot) return [];
	const splits = new Map(splitTargetsForSlot(measure, target.slotIndex, pattern.timeSignature).map((t) => [t.duration, t]));
	const merges = new Map(mergeTargetsForSlot(measure, target.slotIndex).map((t) => [t.duration, t]));
	// A triplet's note value is its written one; it changes as a group, from the triplet switch.
	const current = isTripletDuration(slot.duration) ? null : slot.duration;
	return NOTE_LADDER.map((duration): DurationChoice => {
		if (duration === current) return { duration, kind: "current" };
		if (current === null) return { duration, kind: "off", reason: "A triplet changes as a group: turn the triplet off first" };
		const split = splits.get(duration);
		if (split) return { duration, kind: "split", count: split.count };
		const merge = merges.get(duration);
		if (merge) return { duration, kind: "merge", count: merge.count };
		return { duration, kind: "off", reason: reasonFor(slot.duration, duration) };
	});
}

/** The triplet switch at the cursor: on splits the slot into its triplet, off merges the group back. */
export type TripletChoice =
	| { kind: "hidden" }
	| { kind: "on"; duration: Duration }
	| { kind: "off"; duration: Duration }
	| { kind: "blocked"; reason: string };

export function tripletChoice(pattern: FingerpickPattern, target: SlotTarget): TripletChoice {
	if (isCompound(pattern.timeSignature)) return { kind: "hidden" };
	const measure = pattern.measures[target.measureIndex];
	const slot = measure?.slots[target.slotIndex];
	if (!measure || !slot) return { kind: "hidden" };
	const written = slot.duration;
	if (isTripletDuration(written)) {
		const plain = tripletPlainValue(written);
		const back = mergeTargetsForSlot(measure, target.slotIndex).find((t) => t.duration === plain);
		return back
			? { kind: "off", duration: back.duration }
			: { kind: "blocked", reason: "A triplet turns back from its first note" };
	}
	const triplet = tripletForPlainValue(slot.duration);
	if (!triplet) return { kind: "blocked", reason: "Only a quarter or an eighth splits into a triplet" };
	return { kind: "on", duration: triplet };
}

export type DurationEdit =
	| { type: "ok"; pattern: FingerpickPattern }
	/** A merge that would drop notes: applied only once the player agrees. */
	| { type: "confirm"; pattern: FingerpickPattern; dropped: number };

/** The slot split or merged to `duration`; a merge that would lose notes asks first. */
export function applyDuration(
	pattern: FingerpickPattern,
	target: SlotTarget,
	duration: Duration,
	kind: "split" | "merge",
): DurationEdit {
	const ts = pattern.timeSignature;
	if (kind === "split") {
		return { type: "ok", pattern: withMeasures(pattern, splitSlot(pattern.measures, target.measureIndex, target.slotIndex, duration, ts)) };
	}
	const merged = mergeSlots(pattern.measures, target.measureIndex, target.slotIndex, duration, ts);
	if (merged.type === "ok") return { type: "ok", pattern: withMeasures(pattern, merged.measures) };
	return { type: "confirm", pattern: withMeasures(pattern, merged.pendingMeasures), dropped: merged.affectedSlotCount };
}

const WORDS: readonly [number, string][] = [
	[48, "a half"],
	[24, "a quarter"],
	[12, "an eighth"],
	[6, "a sixteenth"],
	[3, "a thirty-second"],
];

/** A length in ticks, said in note values: "a quarter and an eighth". */
export function lengthInWords(ticks: number): string {
	const out: string[] = [];
	let left = Math.round(ticks);
	for (const [value, word] of WORDS) {
		while (left >= value) {
			out.push(word);
			left -= value;
		}
	}
	if (left > 0) out.push("a little");
	return out.join(" and ");
}

/** Whether a bar adds up: "full", or what it is short or over by. */
export function barFill(measure: Measure, timeSignature: [number, number]): { kind: "full" | "short" | "over"; text: string } {
	const diff = usedUnits(measure.slots) - measureCapacity(timeSignature);
	if (diff === 0) return { kind: "full", text: "Full" };
	return diff < 0
		? { kind: "short", text: `Short by ${lengthInWords(-diff)}` }
		: { kind: "over", text: `Over by ${lengthInWords(diff)}` };
}
