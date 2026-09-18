/**
 * What Chords mode shows for a pressed piano key, with a capo in play.
 *
 * The capo follows the strum page's rule: a chord names the shape the player
 * holds, and a capo at fret N makes it sound N semitones higher. The piano is
 * the sounding side, the neck the fingered side, so one press yields two
 * chords: the one heard (for the piano keys and the numeral) and the one
 * fingered (for the voicing lookup and the marks). Their degrees agree.
 */
import { keyChord, type KeyChord } from "./chords";
import { SCALE_ROOTS, scaleRootPitchClass, type ScaleSpec } from "./scales";
import type { FretMark } from "./types";
import type { SlotPosition } from "./positions";

export interface ChordModeView {
	/** The chord as heard: piano keys, numeral, display name. */
	sounding: KeyChord;
	/** The chord as fingered: the voicing to look up and draw. */
	shape: KeyChord;
	/** The key the shapes are in, spelled like `SCALE_ROOTS`; equals the sounding key at capo 0. */
	shapeKeyRoot: string;
}

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** Resolve a pressed sounding pitch class into the heard and fingered chords. */
export function chordModeView(spec: ScaleSpec, capo: number, soundingPitchClass: number): ChordModeView {
	const shapeKeyRoot = SCALE_ROOTS[mod12(scaleRootPitchClass(spec.root) - capo)];
	const shapeSpec: ScaleSpec = { root: shapeKeyRoot, scale: spec.scale };
	return {
		sounding: keyChord(spec, soundingPitchClass),
		shape: keyChord(shapeSpec, soundingPitchClass - capo),
		shapeKeyRoot,
	};
}

/** The positions of a shape's sounding strings, low to high: what to strike. */
export function shapeSlots(marks: readonly FretMark[]): SlotPosition[] {
	return marks
		.filter((m) => m.emphasis !== "muted")
		.map(({ string, fret }) => ({ string, fret }))
		.sort((a, b) => a.string - b.string);
}

/** Whether a pressed slot is one of the shape's sounding strings. */
export function inShape(marks: readonly FretMark[], slot: SlotPosition): boolean {
	return marks.some((m) => m.emphasis !== "muted" && m.string === slot.string && m.fret === slot.fret);
}
