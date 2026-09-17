// Ranges and reference marks for the fingerpick page's playback controls,
// shared by the desktop panel and the mobile drawer.

export const MIN_BPM = 40;
export const MAX_BPM = 220;

/** Silence between loop passes, offered when looping is on. */
export const LOOP_GAP_OPTIONS = [0, 5, 10] as const;
export type LoopGapSeconds = (typeof LOOP_GAP_OPTIONS)[number];

// BPM fader tick marks: genre reference tempos. `PERCENTS` are the fixed v3
// visual positions on the 40–220 track; `VALUES` are the exact BPM each tick
// snaps to when clicked; `LABELS` are the genre tooltip shown while hovering the
// segment around each tick.
export const BPM_TICK_PERCENTS = [11, 19, 28, 33, 39, 44, 50, 56, 67];
export const BPM_TICK_VALUES = [60, 75, 90, 100, 110, 120, 130, 140, 160];
export const BPM_TICK_LABELS = [
	"Slow Practice",
	"Folk",
	"Ballad",
	"Pop / Blues",
	"Funk",
	"Pop / Rock",
	"Rock",
	"Jazz / Hard Rock",
	"Fast Rock",
];
