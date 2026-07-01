export type Duration = "whole" | "half" | "quarter" | "eighth" | "sixteenth" | "rest";

export type Technique = "hammer-on" | "pull-off" | "slide-up" | "slide-down" | null;

export type StringFret = {
	fret: number | null;   // null = string not in play for this slot
	technique: Technique;  // technique used to arrive at this note from the previous slot
	tied: boolean;         // ties this note to the same string in the previous slot
	muted: boolean;        // render as "x" (palm mute / dead note)
};

export type BeatSlot = {
	id: string;
	duration: Duration;
	strings: [StringFret, StringFret, StringFret, StringFret, StringFret, StringFret];
};

export type Measure = {
	id: string;
	slots: BeatSlot[];
};

export type FingerpickPattern = {
	id: string;
	name: string;
	measures: Measure[];
	bpm: number;
	timeSignature: [number, number];
};

// Pure function mapping duration to relative column width (quarter = 1× base unit).
const DURATION_WIDTH_MULTIPLIERS: Record<Duration, number> = {
	whole: 4,
	half: 2,
	quarter: 1,
	eighth: 0.5,
	sixteenth: 0.25,
	rest: 1,
};

export function durationToWidthMultiplier(duration: Duration): number {
	return DURATION_WIDTH_MULTIPLIERS[duration];
}
