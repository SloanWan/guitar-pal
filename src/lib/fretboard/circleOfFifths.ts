/**
 * The circle of fifths (#158): the twelve major keys a fifth apart, clockwise from C at
 * the top, each with its relative minor inside it and the diminished chord on its seventh
 * degree innermost. Pure: positions are indices 0–11, never pixels.
 *
 * A scale sits on the circle by the major key it is spelled in (its relative major, the
 * offset `usesFlats` reads too), and that key's seven chords sit together: the key and its
 * two neighbours on the outer two rings — I, IV and V outside, vi, ii and iii inside them —
 * with vii° under the key. That is the same set `keyChords` gives, for every scale type,
 * because both read the scale through its parent major.
 */
import { RELATIVE_MAJOR_OFFSET, SCALE_ROOTS, scaleRootPitchClass, type ScaleSpec, type ScaleType } from "./scales";

export type CircleRing = "major" | "minor" | "dim";

export interface CircleCell {
	ring: CircleRing;
	/** 0–11, clockwise from C at the top. */
	index: number;
	pitchClass: number;
	/** ASCII spelling, the way a chart writes it: "F#", "C#m", "E#°". */
	label: string;
	/** One of the key's seven chords. */
	inKey: boolean;
}

/** Whether a scale is heard from a major or a minor tonic: the ring that names its key. */
export const SCALE_FAMILY: Readonly<Record<ScaleType, "major" | "minor">> = {
	major: "major",
	majorPentatonic: "major",
	mixolydian: "major",
	naturalMinor: "minor",
	minorPentatonic: "minor",
	blues: "minor",
	dorian: "minor",
};

// Each spelled the way its own key signature writes it: sharps clockwise to F#, flats from Db.
const MAJOR_LABELS = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
const MINOR_LABELS = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm"];
const DIM_LABELS = ["B°", "F#°", "C#°", "G#°", "D#°", "A#°", "E#°", "C°", "G°", "D°", "A°", "E°"];

/** Semitones above the major key's root, per ring: the key, its relative minor, its seventh. */
const RING_OFFSET: Readonly<Record<CircleRing, number>> = { major: 0, minor: 9, dim: 11 };
const RING_LABELS: Readonly<Record<CircleRing, readonly string[]>> = {
	major: MAJOR_LABELS,
	minor: MINOR_LABELS,
	dim: DIM_LABELS,
};
export const CIRCLE_RINGS: readonly CircleRing[] = ["major", "minor", "dim"];

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** The pitch class at a place on the circle. */
export function circlePitchClass(ring: CircleRing, index: number): number {
	return mod12(7 * index + RING_OFFSET[ring]);
}

/** Where a pitch class sits on a ring; 7 is its own inverse mod 12, so a fifth back is a step. */
export function circleIndex(ring: CircleRing, pitchClass: number): number {
	return mod12(7 * (pitchClass - RING_OFFSET[ring]));
}

/** The index of the major key the scale is spelled in. */
export function keyIndex(spec: ScaleSpec): number {
	return circleIndex("major", scaleRootPitchClass(spec.root) + RELATIVE_MAJOR_OFFSET[spec.scale]);
}

/** Whether a place on the circle holds one of the key's chords. */
function inKey(ring: CircleRing, index: number, key: number): boolean {
	const d = mod12(index - key);
	return ring === "dim" ? d === 0 : d === 0 || d === 1 || d === 11;
}

/** All 36 places, ring by ring, each marked in or out of the scale's key. */
export function circleCells(spec: ScaleSpec): CircleCell[] {
	const key = keyIndex(spec);
	return CIRCLE_RINGS.flatMap((ring) =>
		RING_LABELS[ring].map((label, index) => ({
			ring,
			index,
			pitchClass: circlePitchClass(ring, index),
			label,
			inKey: inKey(ring, index, key),
		})),
	);
}

/** The place that names the key itself: its tonic, on the ring of the scale's family. */
export function keyCell(spec: ScaleSpec): { ring: "major" | "minor"; index: number } {
	const ring = SCALE_FAMILY[spec.scale];
	return { ring, index: circleIndex(ring, scaleRootPitchClass(spec.root)) };
}

/**
 * The key a press on the circle moves to: that tonic, keeping the scale when it is of the
 * ring's kind (a minor key pressed while on the blues stays the blues), else the ring's
 * plain scale. Roots are spelled as the key picker spells them.
 */
export function keyFromCircle(spec: ScaleSpec, ring: "major" | "minor", index: number): ScaleSpec {
	const scale = SCALE_FAMILY[spec.scale] === ring ? spec.scale : ring === "major" ? "major" : "naturalMinor";
	return { root: SCALE_ROOTS[circlePitchClass(ring, index)], scale };
}

/** The ring a chord of this library suffix sits on, if any: only plain triads are on the circle. */
export function ringOfSuffix(suffix: string): CircleRing | null {
	if (suffix === "major") return "major";
	if (suffix === "minor") return "minor";
	if (suffix === "dim") return "dim";
	return null;
}
