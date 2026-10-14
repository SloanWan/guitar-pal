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

// ─── Technique model v2 ──────────────────────────────────────────────────────
// A mark on a note is one of three things, and each has its own place:
//  - a `link`: how the note is reached from the previous note on its string
//    (one per note — a note arrives one way);
//  - an effect in `effects`: what is done to the note itself, keyed by kind so
//    several can coexist and each kind at most once;
//  - a `Span` on the pattern: a mark shared by a run of notes, anchored on slot
//    ids so it crosses barlines and survives edits elsewhere.
// A right-hand hit is a `Percussion` on the slot, like a `Stroke`.
// The technique registry (`techniqueRegistry.ts`) is the one list of kinds.

export type Link =
	| { kind: "tie" }
	| { kind: "hammer" }
	| { kind: "pull" }
	/** Direction is the frets'; `picked` is a shift slide (the target is struck again). */
	| { kind: "slide"; picked?: boolean };
export type LinkKind = Link["kind"];

export interface NoteEffects {
	/** `semitones` in quarter steps (0.5 = ¼, 1 = ½, 2 = full, 3 = 1½); `hold` draws the dashed hold line. */
	bend?: { semitones: number; pre?: boolean; release?: boolean; hold?: boolean };
	vibrato?: { wide?: boolean; bar?: boolean };
	harmonic?: { type: "natural" | "artificial" | "pinch"; touchFret?: number };
	tap?: true;
	trill?: { fret?: number };
	tremolo?: { speed: "8th" | "16th" | "32nd" };
	pick?: { direction: "down" | "up" };
	accent?: true;
	staccato?: true;
	ghost?: true;
	slideIn?: { from: "below" | "above" };
	slideOut?: { to: "below" | "above" };
	/** `semitones` defaults to 12 for a dive and 2 for a pull; `release` brings the bar back. */
	whammy?: { kind: "dive" | "pull"; semitones?: number; release?: boolean };
	scrape?: true;
}
export type EffectKind = keyof NoteEffects;

export type PercussionKind = "slap" | "thumbSlap" | "bodyTap";
export type Percussion = { kind: PercussionKind; accent?: boolean };

export type SpanKind = "palmMute" | "letRing" | "slur";
export type Span = {
	id: string;
	kind: SpanKind;
	/** First and last `BeatSlot.id` under the mark, inclusive. */
	from: string;
	to: string;
	/** The strings it applies to; absent = every sounding string of each slot. */
	strings?: number[];
};

export const FINGERPICK_SCHEMA_VERSION = 2;

export type StringFret = {
	fret: number | null;   // null = string not in play for this slot
	muted: boolean;        // render as "x" (dead note)
	/** How the note is reached from the previous note on its string. */
	link?: Link;
	/** What is done to the note itself, keyed by kind. */
	effects?: NoteEffects;
};

export type BeatSlot = {
	id: string;
	duration: Duration;
	strings: [StringFret, StringFret, StringFret, StringFret, StringFret, StringFret];
	isGraceNote?: boolean;  // no rhythmic duration; scheduling uses fixed 1/32 beat
	isRest?: boolean;       // silent slot — keeps its rhythmic `duration` but produces no sound (rest glyph)
	stroke?: Stroke;        // roll (arpeggiated chord) across this slot's strings — slot-level, not per-string
	/** A right-hand hit on this slot (slap, thumb slap, body tap). Exclusive with `stroke`. */
	percussion?: Percussion;
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
	/** `FINGERPICK_SCHEMA_VERSION`; absent only on data written before model v2, which `migratePattern` brings up. */
	schemaVersion?: number;
	measures: Measure[];
	/** v2: marks shared by runs of notes (palm mute, let ring, slur). */
	spans?: Span[];
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

