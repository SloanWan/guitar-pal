import { bpmRangeForMeter } from "@/lib/strumBars";
import { isCompound, type Meter } from "@/lib/strumMeter";

// Ranges and reference marks for the fingerpick page's playback controls,
// shared by the desktop panel and the mobile drawer.

/** Silence between loop passes, offered when looping is on. */
export const LOOP_GAP_OPTIONS = [0, 5, 10] as const;
export type LoopGapSeconds = (typeof LOOP_GAP_OPTIONS)[number];

// BPM fader tick marks: genre reference tempos, by meter. BPM counts the beat,
// and a compound beat is a dotted quarter, so 6/8 has its own, lower range
// (`bpmRangeForMeter`) and its own references — a jig at ♩. = 115 is brisk.
// `values` are the exact BPM each tick snaps to when clicked; `labels` are the
// genre tooltip shown while hovering the segment around each tick; `percents`
// are the ticks' positions on the track; `scale` the three figures under it.
export interface BpmFaderMarks {
	min: number;
	max: number;
	percents: number[];
	values: number[];
	labels: string[];
	scale: [string, string, string];
}

const SIMPLE_TICKS: readonly [number, string][] = [
	[60, "Slow Practice"],
	[75, "Folk"],
	[90, "Ballad"],
	[100, "Pop / Blues"],
	[110, "Funk"],
	[120, "Pop / Rock"],
	[130, "Rock"],
	[140, "Jazz / Hard Rock"],
	[160, "Fast Rock"],
];

const COMPOUND_TICKS: readonly [number, string][] = [
	[50, "Slow Practice"],
	[60, "6/8 Ballad"],
	[80, "Folk"],
	[100, "Blues / Rock 6/8"],
	[115, "Jig"],
	[130, "Fast Jig"],
];

export function bpmFaderMarks(meter: Meter): BpmFaderMarks {
	const { min, max } = bpmRangeForMeter(meter);
	const ticks = isCompound(meter) ? COMPOUND_TICKS : SIMPLE_TICKS;
	return {
		min,
		max,
		percents: ticks.map(([v]) => Math.round(((v - min) / (max - min)) * 100)),
		values: ticks.map(([v]) => v),
		labels: ticks.map(([, label]) => label),
		scale: [String(min), String((min + max) / 2), String(max)],
	};
}
