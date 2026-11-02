/**
 * A wait before the first pass: a few seconds to put the hands on the guitar,
 * with a cue each second. Only the start counts in — a loop's passes are spaced
 * by its gap, and a paused tab resumes at once.
 */

/** The waits offered, in seconds. */
export const COUNT_INS = [3, 5, 10] as const;
export type CountInSeconds = (typeof COUNT_INS)[number];

export interface CountInSetting {
	on: boolean;
	seconds: CountInSeconds;
	/** A cue sounds each second of the wait. */
	cue: boolean;
}

export const DEFAULT_COUNT_IN: CountInSetting = { on: false, seconds: 5, cue: true };

/** Per-viewer, shared by every page with a player. */
export const COUNT_IN_KEY = "playerCountIn";

/** The seconds to wait before a start: none while the count-in is off. */
export function countInSeconds(setting: CountInSetting): number {
	return setting.on ? setting.seconds : 0;
}

/** A stored setting, or null for anything this version does not read. */
export function readCountIn(raw: string): CountInSetting | null {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof value !== "object" || value === null) return null;
	const { on, seconds, cue } = value as Record<string, unknown>;
	if (typeof on !== "boolean" || typeof cue !== "boolean") return null;
	if (!COUNT_INS.includes(seconds as CountInSeconds)) return null;
	return { on, seconds: seconds as CountInSeconds, cue };
}

export function formatCountIn(setting: CountInSetting): string {
	return JSON.stringify(setting);
}

/** One cue of the wait: `at` seconds after the press, with `left` seconds to go. */
export interface CountInCue {
	at: number;
	left: number;
	/** The last three, as a count of 3, 2, 1: a higher, brighter cue. */
	accent: boolean;
}

/** How many of the last cues are marked as the count. */
const COUNTED = 3;

/** A cue on each whole second, from the press to the second before the first note. */
export function countInCues(seconds: number): CountInCue[] {
	const whole = Math.max(0, Math.floor(seconds));
	return Array.from({ length: whole }, (_, i) => {
		const left = whole - i;
		return { at: i, left, accent: left <= COUNTED };
	});
}
