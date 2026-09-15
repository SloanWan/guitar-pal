import type { ChordRef } from "@/lib/strumPatterns";

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
	| "32nd";

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

/**
 * A right-hand sweep across a slot's strings. Slot-level, never per-string — a
 * sweep is one physical right-hand action. Semantics are defined by the PLAYING
 * ACTION, not by notated appearance; the renderer maps these to arrows.
 *  - "roll-*"  = a slow, deliberate arpeggio (strings clearly one after another)
 *  - "brush-*" = a fast strum (strings near enough together to read as one chord)
 *  - "*-down"  = hand moves down = low pitch → high pitch = stringIndex 5 → 0
 *  - "*-up"    = hand moves up   = high pitch → low pitch = stringIndex 0 → 5
 */
export type Stroke = "roll-down" | "roll-up" | "brush-down" | "brush-up";

/** The hand's travel direction of a stroke, whatever its speed. */
export function strokeDirection(stroke: Stroke): "down" | "up" {
	return stroke === "roll-down" || stroke === "brush-down" ? "down" : "up";
}

/** Whether a stroke is the fast kind. */
export function isBrush(stroke: Stroke): boolean {
	return stroke === "brush-down" || stroke === "brush-up";
}

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
	isRest?: boolean;       // silent slot — keeps its rhythmic `duration` but produces no sound (rest glyph)
	stroke?: Stroke;        // roll (arpeggiated chord) across this slot's strings — slot-level, not per-string
	/**
	 * A chord change at this slot. The chord stays in effect until the next slot
	 * that carries one, across measure boundaries, like a lead sheet — so a
	 * one-chord pattern marks only its first slot. It names what the player is
	 * holding; the frets are what sound, so playback never reads it. Resolved
	 * per slot by `effectiveChords` in fingerpickChords.ts.
	 */
	chord?: ChordRef;
};

export type Measure = {
	id: string;
	slots: BeatSlot[];
	/** Render a repeat-start barline (|:) on this measure's LEFT edge. */
	repeatStart?: boolean;
	/** Render a repeat-end barline (:|) on this measure's RIGHT edge. */
	repeatEnd?: boolean;
	/**
	 * Total times the repeated section ENDING at this measure is played (default 2 =
	 * one loop-back). Only meaningful together with `repeatEnd`.
	 */
	repeatTimes?: number;
};

export type FingerpickPattern = {
	id: string;
	name: string;
	description?: string;
	measures: Measure[];
	bpm: number;
	timeSignature: [number, number];
	/**
	 * The fret the pattern is played behind. The TAB is written relative to the
	 * capo (it is the nut), chord shapes are written as they are, and playback
	 * sounds this many semitones higher. Absent or 0 = no capo. Read it through
	 * `patternCapo` in fingerpickChords.ts.
	 */
	capo?: number;
	/**
	 * When the pattern was first saved (ISO 8601). Orders the library newest
	 * first; presets and patterns stored before the stamp have none.
	 */
	createdAt?: string;
};

