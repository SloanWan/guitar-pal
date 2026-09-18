/**
 * Scale → fretboard positions. Interval sets only: 12 roots × 7 scale types are
 * generated on demand, never stored. Everything here is pure.
 */
import { GUITAR_OPEN_MIDI, NOTE_NAMES, ROOT_PITCH_CLASS } from "@/lib/chordVoicingToMidi";

import { STRING_COUNT, type FretMark, type FretWindow } from "./types";

export type ScaleType =
	| "major"
	| "naturalMinor"
	| "majorPentatonic"
	| "minorPentatonic"
	| "blues"
	| "dorian"
	| "mixolydian";

export const SCALE_TYPES: readonly ScaleType[] = [
	"major",
	"naturalMinor",
	"majorPentatonic",
	"minorPentatonic",
	"blues",
	"dorian",
	"mixolydian",
];

export const SCALE_LABELS: Readonly<Record<ScaleType, string>> = {
	major: "Major",
	naturalMinor: "Natural minor",
	majorPentatonic: "Major pentatonic",
	minorPentatonic: "Minor pentatonic",
	blues: "Blues",
	dorian: "Dorian",
	mixolydian: "Mixolydian",
};

/** Semitones above the root, ascending, root included. */
export const SCALE_INTERVALS: Readonly<Record<ScaleType, readonly number[]>> = {
	major: [0, 2, 4, 5, 7, 9, 11],
	naturalMinor: [0, 2, 3, 5, 7, 8, 10],
	majorPentatonic: [0, 2, 4, 7, 9],
	minorPentatonic: [0, 3, 5, 7, 10],
	blues: [0, 3, 5, 6, 7, 10],
	dorian: [0, 2, 3, 5, 7, 9, 10],
	mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

/**
 * Semitones from the scale root up to the root of its relative major, i.e. the
 * key signature the scale is spelled in. Natural minor and both minor-flavoured
 * pentatonics sit a minor third below their relative major; dorian a major
 * second above; mixolydian a perfect fifth above.
 */
const RELATIVE_MAJOR_OFFSET: Readonly<Record<ScaleType, number>> = {
	major: 0,
	naturalMinor: 3,
	majorPentatonic: 0,
	minorPentatonic: 3,
	blues: 3,
	dorian: 10,
	mixolydian: 5,
};

/**
 * The twelve roots offered to a player, each in the spelling its major key is
 * written in (Db rather than C#, F# rather than Gb: the guitar convention).
 */
export const SCALE_ROOTS: readonly string[] = [
	"C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
];

export type LabelMode = "note" | "degree";

/** Scale-degree label for each interval above the root, flats for altered degrees. */
export const DEGREE_LABELS: readonly string[] = [
	"1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7",
];

const FLAT_NOTE_NAMES: readonly string[] = [
	"C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
];

/** Major keys written with flats. Pitch class 6 (Gb/F#) is left to the root spelling. */
const FLAT_MAJOR_KEYS: ReadonlySet<number> = new Set([5, 10, 3, 8, 1]);

export interface ScaleSpec {
	/** A spelling `ROOT_PITCH_CLASS` knows: "A", "Bb", "F#". */
	root: string;
	scale: ScaleType;
}

export function degreeLabel(semitonesAboveRoot: number): string {
	return DEGREE_LABELS[((semitonesAboveRoot % 12) + 12) % 12];
}

export function scaleRootPitchClass(root: string): number {
	const pc = ROOT_PITCH_CLASS[root];
	if (pc === undefined) throw new Error(`Unknown scale root: ${root}`);
	return pc;
}

/** Pitch classes (0..11) in the scale, in ascending interval order. */
export function scalePitchClasses(spec: ScaleSpec): number[] {
	const rootPc = scaleRootPitchClass(spec.root);
	return SCALE_INTERVALS[spec.scale].map((i) => (rootPc + i) % 12);
}

/**
 * Whether the scale's notes are written with flats. Roots that carry an
 * accidental decide for themselves; natural roots follow the key signature of
 * the relative major, so D minor gets a Bb and E minor an F#.
 */
export function usesFlats(spec: ScaleSpec): boolean {
	if (spec.root.includes("b")) return true;
	if (spec.root.includes("#")) return false;
	const relativeMajor = (scaleRootPitchClass(spec.root) + RELATIVE_MAJOR_OFFSET[spec.scale]) % 12;
	return FLAT_MAJOR_KEYS.has(relativeMajor);
}

/**
 * How a pitch class is labelled inside this scale: its note name in the key's
 * spelling, or its degree above the root. Works for pitch classes outside the
 * scale too, which is what a non-diatonic chord overlay needs.
 */
export function createLabeler(spec: ScaleSpec, mode: LabelMode): (pitchClass: number) => string {
	const rootPc = scaleRootPitchClass(spec.root);
	const names = usesFlats(spec) ? FLAT_NOTE_NAMES : NOTE_NAMES;
	return (pitchClass) =>
		mode === "degree" ? degreeLabel(pitchClass - rootPc) : names[((pitchClass % 12) + 12) % 12];
}

export function pitchClassAt(string: number, fret: number): number {
	return (GUITAR_OPEN_MIDI[string] + fret) % 12;
}

/**
 * Every position of the scale inside the window, low E first, nut to body.
 * Roots are emphasised as `root`, every other scale tone as `scaleTone`.
 */
export function scaleMarks(spec: ScaleSpec, window: FretWindow, mode: LabelMode): FretMark[] {
	const rootPc = scaleRootPitchClass(spec.root);
	const inScale = new Set(scalePitchClasses(spec));
	const label = createLabeler(spec, mode);
	const marks: FretMark[] = [];
	for (let string = 0; string < STRING_COUNT; string++) {
		for (let fret = window.fromFret; fret <= window.toFret; fret++) {
			const pc = pitchClassAt(string, fret);
			if (!inScale.has(pc)) continue;
			marks.push({
				string,
				fret,
				label: label(pc),
				emphasis: pc === rootPc ? "root" : "scaleTone",
			});
		}
	}
	return marks;
}
