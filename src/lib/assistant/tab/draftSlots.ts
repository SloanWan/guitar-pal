import type { Duration, Link, NoteEffects, Percussion } from "@/lib/fingerpickTypes";
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

/** What a note can carry besides its fret: how it is reached, what is done to it, the brackets over it. */
export interface NoteMarks {
	link?: Link;
	effects?: NoteEffects;
	palmMute?: boolean;
	letRing?: boolean;
}

/** A note on its string, before it has a place in the bar. */
export interface GridNote extends NoteMarks {
	/** 0 = high e, 5 = low E — the fingerpick order the editor stores. */
	stringIndex: number;
	fret: number | null;
	muted: boolean;
}

/**
 * A note as the draft holds it: the v2 marks, plus the v1 fields the
 * validator still requires on a note (`technique`, `tied`), which it fills
 * from the marks.
 */
export interface DraftStringFret extends NoteMarks {
	fret: number | null;
	technique: null;
	tied: false;
	muted: boolean;
}

export interface DraftSlot {
	duration: Duration;
	isRest?: boolean;
	/** A right-hand hit on the slot. */
	percussion?: Percussion;
	strings: DraftStringFret[];
}

export function emptyStrings(): DraftStringFret[] {
	return Array.from({ length: 6 }, () => ({ fret: null, technique: null, tied: false, muted: false }));
}

/** A draft note from a grid note: the marks it carries, nothing it does not. */
export function draftNote(note: GridNote): DraftStringFret {
	const out: DraftStringFret = { fret: note.fret, technique: null, tied: false, muted: note.muted };
	if (note.link) out.link = note.link;
	if (note.effects && Object.keys(note.effects).length > 0) out.effects = note.effects;
	if (note.palmMute) out.palmMute = true;
	if (note.letRing) out.letRing = true;
	return out;
}

export interface BarSlotsResult {
	slots: DraftSlot[];
	/** More onsets than the bar has 32nds to start them on; the rest was dropped. */
	overflow: boolean;
}

/**
 * `byPosition` keys are positions on the grid and `positions` is how many the
 * bar has. Each onset is placed where its position falls in the bar, on the
 * 32nd grid, and a note lasts until the next onset or the bar's end — so the
 * bar always adds up to `capacity`, whatever its width in positions. A grid
 * that divides the bar evenly lands exactly; one that does not is read to the
 * nearest 32nd. Two onsets that would share a 32nd are kept apart, which can
 * push the last ones past the bar: those are dropped and reported. `hits`
 * names the positions that carry a right-hand hit.
 */
export function barSlots(
	byPosition: ReadonlyMap<number, readonly GridNote[]>,
	positions: number,
	capacity: number,
	hits: ReadonlyMap<number, Percussion> = new Map(),
): BarSlotsResult {
	const onsets = [...new Set([...byPosition.keys(), ...hits.keys()])].sort((a, b) => a - b);
	const slots: DraftSlot[] = [];
	let used = 0;
	const step = DURATION_TICKS["32nd"];
	const starts: number[] = [];
	let prev = -step;
	for (const position of onsets) {
		let tick = Math.round((position / positions) * capacity / step) * step;
		if (tick <= prev) tick = prev + step;
		starts.push(tick);
		prev = tick;
	}
	const kept = starts.filter((tick) => tick < capacity).length;

	const push = (durations: Duration[], first: readonly GridNote[] | null, hit: Percussion | undefined) => {
		durations.forEach((duration, i) => {
			const ticks = DURATION_TICKS[duration];
			if (used + ticks > capacity) return;
			used += ticks;
			const slot: DraftSlot = { duration, strings: emptyStrings() };
			if (i === 0 && (first || hit)) {
				for (const note of first ?? []) slot.strings[note.stringIndex] = draftNote(note);
				if (hit) slot.percussion = hit;
			} else {
				slot.isRest = true;
			}
			slots.push(slot);
		});
	};

	if (kept === 0 || starts[0] > 0) {
		push(splitTicks(kept === 0 ? capacity : starts[0]), null, undefined);
	}
	for (let i = 0; i < kept; i++) {
		const next = i + 1 < kept ? starts[i + 1] : capacity;
		push(splitTicks(next - starts[i]), byPosition.get(onsets[i]) ?? null, hits.get(onsets[i]));
	}

	if (used < capacity) push(splitTicks(capacity - used), null, undefined);
	if (slots.length === 0) push(splitTicks(capacity), null, undefined);
	return { slots, overflow: kept < onsets.length };
}
