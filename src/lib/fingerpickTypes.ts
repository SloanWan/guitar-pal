export type Duration =
	| "whole"
	| "half"
	| "quarter"
	| "dotted-quarter"
	| "eighth"
	| "dotted-eighth"
	| "eighth-triplet"
	| "sixteenth"
	| "sixteenth-triplet"
	| "32nd"
	| "rest";

export type Technique =
	| "hammer-on"
	| "pull-off"
	| "slide-up"
	| "slide-down"
	| "bend-full"
	| "bend-half"
	| "bend-quarter"
	| "bend-release"
	| "pre-bend"
	| "pre-bend-release"
	| "vibrato"
	| "vibrato-wide"
	| "vibrato-bar"
	| "tapping"
	| "trill"
	| "harmonic-natural"
	| "harmonic-artificial"
	| "whammy-dive"
	| "whammy-pull"
	| "pick-scrape"
	| "grace-note"
	| null;

export type StringFret = {
	fret: number | null;   // null = string not in play for this slot
	technique: Technique;  // technique used to arrive at this note from the previous slot
	tied: boolean;         // ties this note to the same string in the previous slot
	muted: boolean;        // render as "x" (palm mute / dead note)
	bendTarget?: number;                             // semitones: full=2, half=1, quarter=0.5
	palmMute?: boolean;                              // P.M.
	letRing?: boolean;                               // let note ring beyond written duration
	staccato?: boolean;
	accent?: boolean;
	ghostNote?: boolean;                             // bracketed note (7)
	tremoloPickingSpeed?: "8th" | "16th" | "32nd";  // rapid repeat-picking on one note
	pickStroke?: "down" | "up";
};

export type BeatSlot = {
	id: string;
	duration: Duration;
	strings: [StringFret, StringFret, StringFret, StringFret, StringFret, StringFret];
	isGraceNote?: boolean;  // no rhythmic duration; scheduling uses fixed 1/32 beat
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

