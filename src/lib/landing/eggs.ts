/**
 * The landing page's easter eggs, as plain rules: what counts as tuning up,
 * as dropping the pick, as late at night, as an air strum. The components
 * that play them only wire these to keys, clicks, the clock and the pointer.
 */

/** The open strings, low to high: the keys that tune, and the notes they sound (MIDI). */
export const TUNING_KEYS = ["e", "a", "d", "g", "b", "e"] as const;
export const TUNING_MIDI = [40, 45, 50, 55, 59, 64] as const;

export interface TuningStep {
	/** How many strings are tuned now, 0–6. */
	progress: number;
	/** The open string this key sounds, or null for a key that is not the next string. */
	midi: number | null;
	/** True on the key that tunes the sixth string. */
	done: boolean;
}

/**
 * One key toward E A D G B E. The next string's letter sounds it and moves on;
 * any other key starts over — except an E, which starts over from the low E,
 * so a run begun again mid-way is not lost.
 */
export function advanceTuning(progress: number, key: string): TuningStep {
	const k = key.toLowerCase();
	const at = progress >= TUNING_KEYS.length ? 0 : progress;
	if (k === TUNING_KEYS[at]) {
		const next = at + 1;
		return { progress: next === TUNING_KEYS.length ? 0 : next, midi: TUNING_MIDI[at], done: next === TUNING_KEYS.length };
	}
	if (k === TUNING_KEYS[0]) return { progress: 1, midi: TUNING_MIDI[0], done: false };
	return { progress: 0, midi: null, done: false };
}

/** Presses on Play within this window count toward dropping the pick. */
export const PICK_DROP_WINDOW_MS = 2500;
/** Presses it takes. */
export const PICK_DROP_TAPS = 7;

/** Adds a press at `now`: the presses still inside the window, and whether this one drops the pick. */
export function registerTap(taps: readonly number[], now: number): { taps: number[]; dropped: boolean } {
	const recent = [...taps.filter((t) => now - t < PICK_DROP_WINDOW_MS), now];
	if (recent.length >= PICK_DROP_TAPS) return { taps: [], dropped: true };
	return { taps: recent, dropped: false };
}

/** Midnight to five in the morning, on the visitor's own clock. */
export function isLateNight(date: Date): boolean {
	return date.getHours() < 5;
}

/** An air strum needs at least this much travel … */
export const AIR_STRUM_MIN_PX = 28;
/** … at at least this speed (px per ms): a flick, not a hand drifting over the grid. */
export const AIR_STRUM_MIN_SPEED = 0.5;

/** A vertical sweep read as a strum: down the page is a down strum. Null when it is too short or too slow. */
export function strumFromSweep(dy: number, dtMs: number): "down" | "up" | null {
	if (Math.abs(dy) < AIR_STRUM_MIN_PX || dtMs <= 0) return null;
	if (Math.abs(dy) / dtMs < AIR_STRUM_MIN_SPEED) return null;
	return dy > 0 ? "down" : "up";
}
