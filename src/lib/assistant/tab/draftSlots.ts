import type { Duration, Technique } from "@/lib/fingerpickTypes";
import { DURATION_TICKS } from "@/lib/fingerpickEdit";
import { splitTicks } from "@/lib/assistant/tab/ticks";

/**
 * Notes on a grid, written out as one bar of slots.
 *
 * Both ways into a draft land here: a tab a player pasted, whose grid is its
 * characters, and a pattern the model composed, whose grid is the slots it
 * asked for. What they share is the reading — a note sounds until the next
 * position that carries one, or to the end of the bar, the way a tab reads —
 * so it is written once and the two callers only differ in how they arrive at
 * the grid.
 */

/** A note on its string, before it has a place in the bar. */
export interface GridNote {
	/** 0 = high e, 5 = low E — the fingerpick order the editor stores. */
	stringIndex: number;
	fret: number | null;
	muted: boolean;
	technique: Technique;
}

export interface DraftStringFret {
	fret: number | null;
	technique: Technique;
	tied: boolean;
	muted: boolean;
}

export interface DraftSlot {
	duration: Duration;
	isRest?: boolean;
	strings: DraftStringFret[];
}

export function emptyStrings(): DraftStringFret[] {
	return Array.from({ length: 6 }, () => ({ fret: null, technique: null, tied: false, muted: false }));
}

export interface BarSlotsResult {
	slots: DraftSlot[];
	/** The grid asked for more than the bar holds; the rest was dropped. */
	overflow: boolean;
}

/**
 * `byPosition` keys are positions on the grid, `positions` is how many the bar
 * has, and `positionTicks` is what one is worth. A bar is filled to `capacity`
 * and no further: anything past it is dropped and reported.
 */
export function barSlots(
	byPosition: ReadonlyMap<number, readonly GridNote[]>,
	positions: number,
	positionTicks: number,
	capacity: number,
): BarSlotsResult {
	const onsets = [...byPosition.keys()].sort((a, b) => a - b);
	const slots: DraftSlot[] = [];
	let used = 0;

	const push = (durations: Duration[], first: readonly GridNote[] | null) => {
		durations.forEach((duration, i) => {
			const ticks = DURATION_TICKS[duration];
			if (used + ticks > capacity) return;
			used += ticks;
			const slot: DraftSlot = { duration, strings: emptyStrings() };
			if (i === 0 && first) {
				for (const note of first) {
					slot.strings[note.stringIndex] = {
						fret: note.fret,
						technique: note.technique,
						tied: false,
						muted: note.muted,
					};
				}
			} else {
				slot.isRest = true;
			}
			slots.push(slot);
		});
	};

	if (onsets.length === 0 || onsets[0] > 0) {
		push(splitTicks((onsets[0] ?? positions) * positionTicks), null);
	}
	onsets.forEach((position, i) => {
		const next = onsets[i + 1] ?? positions;
		push(splitTicks((next - position) * positionTicks), byPosition.get(position)!);
	});

	const overflow = positions * positionTicks > capacity;
	if (used < capacity) push(splitTicks(capacity - used), null);
	if (slots.length === 0) push(splitTicks(capacity), null);
	return { slots, overflow };
}
