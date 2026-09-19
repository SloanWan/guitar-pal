/**
 * A chord progression in Chords mode: a list of degrees, resolved through the
 * current key when it is played.
 *
 * Each bar stores the chord as **semitones above the key's root**, the same
 * way the mode holds its one selected chord. That is what makes the strip a
 * chart rather than a list of chord names: change the key and every bar
 * transposes, the numerals stay put, and a chromatic chord (♭VII, ♯IV) keeps
 * its accidental because the interval is what survives, not the pitch class.
 * `keyChord` turns an interval back into a chord — diatonic triad or a major
 * triad on a chromatic root — so the strip never needs its own theory.
 *
 * One strum per bar on the downbeat, four beats to the bar: the bar is the
 * unit of time and the chord is all that changes. Nothing here is persisted.
 */
import type { ChordVoicing } from "@/lib/chordVoicing";

import { chordModeView, shapeSlots } from "./chordMode";
import { PARENT_SCALE, shapeMarks, shapePitches, type KeyChord } from "./chords";
import type { SlotPosition } from "./positions";
import { SCALE_INTERVALS, scaleRootPitchClass, type ScaleSpec } from "./scales";
import type { SequenceStep } from "./sequence";

export interface ProgressionStep {
	/** Semitones above the key's root, 0..11. */
	interval: number;
}

/** A strip longer than this stops being a progression and starts being a song. */
export const MAX_BARS = 16;

export const PROGRESSION_BPM = { min: 40, max: 220, default: 90 } as const;

/** Four beats to a bar; one strum, on the first. */
export const BEATS_PER_BAR = 4;

/** Seconds a bar lasts at this tempo. */
export function barSeconds(bpm: number): number {
	return (60 / bpm) * BEATS_PER_BAR;
}

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** Append a bar; a full strip is left as it is. */
export function appendStep(steps: readonly ProgressionStep[], interval: number): ProgressionStep[] {
	if (steps.length >= MAX_BARS) return [...steps];
	return [...steps, { interval: mod12(interval) }];
}

/** Take one bar out; an index off the strip changes nothing. */
export function removeStep(steps: readonly ProgressionStep[], index: number): ProgressionStep[] {
	return steps.filter((_, i) => i !== index);
}

export interface ProgressionPreset {
	/** The name a chart gives it, in major-key numerals: "I–V–vi–IV". */
	name: string;
	/** Scale degrees, 1..7, resolved through the key's parent scale. */
	degrees: readonly number[];
}

/** The four worth knowing first. */
export const PROGRESSION_PRESETS: readonly ProgressionPreset[] = [
	{ name: "I–V–vi–IV", degrees: [1, 5, 6, 4] },
	{ name: "ii–V–I", degrees: [2, 5, 1] },
	{ name: "I–IV–V", degrees: [1, 4, 5] },
	{ name: "vi–IV–I–V", degrees: [6, 4, 1, 5] },
];

/**
 * A preset's degrees as intervals in this key's parent scale, so "I–V–vi–IV"
 * in A minor becomes i–v–VI–iv: the degrees are the pattern, the qualities
 * are the key's.
 */
export function presetSteps(preset: ProgressionPreset, spec: ScaleSpec): ProgressionStep[] {
	const steps = SCALE_INTERVALS[PARENT_SCALE[spec.scale]];
	return preset.degrees.map((degree) => ({ interval: steps[degree - 1] }));
}

/** A bar as it will be played: the chord heard, the shape held, and what to sound and light. */
export interface ResolvedBar {
	/** The chord as heard: numeral and name for the strip, keys on the piano. */
	sounding: KeyChord;
	/** The chord as fingered, with the capo: the voicing looked up. */
	shape: KeyChord;
	/** Null when the library has nothing for the shape; the bar is then silent. */
	voicing: ChordVoicing | null;
	/** Sounding MIDI, low to high; empty for a silent bar. */
	midis: readonly number[];
	/** The shape's sounding strings on the neck; empty for a silent bar. */
	slots: readonly SlotPosition[];
}

/**
 * Resolve every bar through the key and the capo. `voicingFor` answers from
 * whatever the caller has loaded; a bar it has nothing for keeps its place in
 * time and sounds nothing, like an unknown chord on the strum page.
 */
export function resolveProgression(
	steps: readonly ProgressionStep[],
	spec: ScaleSpec,
	capo: number,
	voicingFor: (chord: KeyChord) => ChordVoicing | null,
): ResolvedBar[] {
	const rootPc = scaleRootPitchClass(spec.root);
	return steps.map(({ interval }) => {
		const { sounding, shape } = chordModeView(spec, capo, rootPc + interval);
		const voicing = voicingFor(shape);
		if (!voicing) return { sounding, shape, voicing: null, midis: [], slots: [] };
		return {
			sounding,
			shape,
			voicing,
			midis: shapePitches(voicing, capo),
			slots: shapeSlots(shapeMarks(voicing, capo, shape.rootPitchClass, () => "")),
		};
	});
}

/** The bars as the player takes them. */
export function progressionSteps(bars: readonly ResolvedBar[]): SequenceStep[] {
	return bars.map(({ midis, slots }) => ({ midis, slots }));
}
