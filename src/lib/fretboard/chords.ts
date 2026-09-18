/**
 * The chords of a key, and a chord shape as marks on the neck.
 *
 * Chords are built the way theory builds them: stack thirds on a seven-note
 * scale. Pentatonic and blues scales have too few notes for that, so their
 * chords come from the seven-note scale they are drawn from (minor pentatonic
 * and blues from natural minor, major pentatonic from major). A pitch class
 * outside the parent scale still gets a chord, a plain major triad, so a
 * player can hear what a borrowed chord does; its numeral carries the
 * accidental the key would write it with.
 *
 * Roots come out in the chord library's spelling (C#, Eb, Ab, Bb), which is
 * not `SCALE_ROOTS`' spelling (Db), so a voicing lookup works directly.
 */
import { ROOT_CHROMATIC_ORDER } from "@/lib/chordSuffixes";
import { GUITAR_OPEN_MIDI, chordVoicingToMidi } from "@/lib/chordVoicingToMidi";
import { decodeVoicingStrings, type ChordVoicing } from "@/lib/chordVoicingToVexChords";

import { chordToneRole } from "./overlay";
import { SCALE_INTERVALS, scaleRootPitchClass, type ScaleSpec, type ScaleType } from "./scales";
import { STRING_COUNT, type FretMark } from "./types";

export type ChordQuality = "major" | "minor" | "dim" | "aug";

export interface KeyChord {
	/** Chord-library spelling: "C#", "Eb". */
	root: string;
	rootPitchClass: number;
	/** The chord library's suffix for the triad. */
	suffix: ChordQuality;
	/** "I", "ii", "vii°", "♭II", "♯IV"… */
	numeral: string;
	/** 1..7 inside the parent scale; null for a chromatic chord. */
	degree: number | null;
	diatonic: boolean;
	/** The triad's pitch classes, root first. */
	pitchClasses: readonly number[];
}

/** Seven-note scale every scale type builds its chords on. */
export type ParentScale = "major" | "naturalMinor" | "dorian" | "mixolydian";

export const PARENT_SCALE: Readonly<Record<ScaleType, ParentScale>> = {
	major: "major",
	naturalMinor: "naturalMinor",
	majorPentatonic: "major",
	minorPentatonic: "naturalMinor",
	blues: "naturalMinor",
	dorian: "dorian",
	mixolydian: "mixolydian",
};

const ROMAN: readonly string[] = ["I", "II", "III", "IV", "V", "VI", "VII"];

/**
 * How each key writes the five pitch classes outside its parent scale, keyed
 * by semitones above the root. Major keys flatten the degree above (♭II, ♭VI,
 * ♭VII); minor-flavoured keys, whose III, VI and VII are already low, raise
 * the degree below (♯III, ♯VI, ♯VII). The tritone is ♯IV everywhere.
 */
const CHROMATIC_NUMERAL: Readonly<Record<ParentScale, Readonly<Record<number, string>>>> = {
	major: { 1: "♭II", 3: "♭III", 6: "♯IV", 8: "♭VI", 10: "♭VII" },
	naturalMinor: { 1: "♭II", 4: "♯III", 6: "♯IV", 9: "♯VI", 11: "♯VII" },
	dorian: { 1: "♭II", 4: "♯III", 6: "♯IV", 8: "♭VI", 11: "♯VII" },
	mixolydian: { 1: "♭II", 3: "♭III", 6: "♯IV", 8: "♭VI", 11: "♯VII" },
};

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

function quality(root: number, third: number, fifth: number): ChordQuality {
	const t = mod12(third - root);
	const f = mod12(fifth - root);
	if (t === 4 && f === 8) return "aug";
	if (t === 3 && f === 6) return "dim";
	if (t === 3) return "minor";
	return "major";
}

function numeralFor(degree: number, q: ChordQuality): string {
	const base = ROMAN[degree - 1];
	switch (q) {
		case "major":
			return base;
		case "aug":
			return `${base}+`;
		case "minor":
			return base.toLowerCase();
		case "dim":
			return `${base.toLowerCase()}°`;
	}
}

/** The chord a key builds on `pitchClass`: diatonic triad, or a major triad on a chromatic root. */
export function keyChord(spec: ScaleSpec, pitchClass: number): KeyChord {
	const rootPc = scaleRootPitchClass(spec.root);
	const parent = PARENT_SCALE[spec.scale];
	const steps = SCALE_INTERVALS[parent];
	const pc = mod12(pitchClass);
	const above = mod12(pc - rootPc);
	const index = steps.indexOf(above);
	const root = ROOT_CHROMATIC_ORDER[pc];

	if (index === -1) {
		return {
			root,
			rootPitchClass: pc,
			suffix: "major",
			numeral: CHROMATIC_NUMERAL[parent][above],
			degree: null,
			diatonic: false,
			pitchClasses: [pc, mod12(pc + 4), mod12(pc + 7)],
		};
	}

	const third = mod12(rootPc + steps[(index + 2) % 7]);
	const fifth = mod12(rootPc + steps[(index + 4) % 7]);
	const q = quality(pc, third, fifth);
	return {
		root,
		rootPitchClass: pc,
		suffix: q,
		numeral: numeralFor(index + 1, q),
		degree: index + 1,
		diatonic: true,
		pitchClasses: [pc, third, fifth],
	};
}

/** The seven diatonic chords of the key, degree I to VII. */
export function keyChords(spec: ScaleSpec): KeyChord[] {
	const rootPc = scaleRootPitchClass(spec.root);
	return SCALE_INTERVALS[PARENT_SCALE[spec.scale]].map((step) => keyChord(spec, rootPc + step));
}

/**
 * Sounding MIDI of a shape's strings, low to high, muted strings left out. The
 * chord names the shape the player holds; a capo at fret N sounds it N higher.
 */
export function shapePitches(voicing: ChordVoicing, capo: number): number[] {
	return chordVoicingToMidi(voicing).map(({ midi }) => midi + capo);
}

/**
 * A chord shape as marks: fretted and open strings lit, the root in `root`
 * emphasis and the rest as chord tones with their role, muted strings as a
 * `muted` mark at the capo (or the nut). Frets are absolute on the neck, so
 * the shape sits above the capo bar. `rootPitchClass` is the shape's root, as
 * fingered; `label` names each sounding pitch class.
 */
export function shapeMarks(
	voicing: ChordVoicing,
	capo: number,
	rootPitchClass: number,
	label: (pitchClass: number) => string,
): FretMark[] {
	const soundingRoot = mod12(rootPitchClass + capo);
	const marks: FretMark[] = [];
	for (const { stringIndex, absoluteFret } of decodeVoicingStrings(voicing)) {
		if (stringIndex >= STRING_COUNT) continue;
		if (absoluteFret === "x") {
			marks.push({ string: stringIndex, fret: capo, label: "", emphasis: "muted" });
			continue;
		}
		const fret = absoluteFret + capo;
		const pc = mod12(GUITAR_OPEN_MIDI[stringIndex] + fret);
		if (pc === soundingRoot) {
			marks.push({ string: stringIndex, fret, label: label(pc), emphasis: "root" });
		} else {
			marks.push({
				string: stringIndex,
				fret,
				label: label(pc),
				emphasis: "chordTone",
				tone: chordToneRole(pc - soundingRoot),
			});
		}
	}
	return marks;
}
