/**
 * The chord on show in Chords mode, whichever way it was chosen.
 *
 * Two ways in. A **degree**: a piano key or a position's numeral picks one of
 * the key's chords, and the capo rule says which shape fingers it. A **held
 * chord**: the player names a shape — `Am7`, or the grip `x02010` — and asks
 * what it sounds like under this capo. The second is the first read backwards:
 * the shape is given, the sounding chord is the shape moved up by the capo,
 * and the numeral is whatever the key makes of that.
 *
 * Both arrive here as a `ShownChord`, so the readout, the marks and the piano
 * never need to know which way the chord came in.
 */
import { ROOT_CHROMATIC_ORDER, isSlashChord } from "@/lib/chordSuffixes";

import { keyChord, type KeyChord } from "./chords";
import { scalePitchClasses, type ScaleSpec } from "./scales";

/** A chord by the library's spelling, with its root's pitch class. */
export interface ChordName {
	root: string;
	/** The library's suffix: "major", "m7", "/G", "m/C#"… */
	suffix: string;
	rootPitchClass: number;
}

export interface ShownChord {
	/** As heard, the capo applied: what the piano shows and the readout names. */
	sounding: ChordName;
	/** As fingered: the shape to look up and draw. */
	shape: ChordName;
	/** The heard chord's numeral in the key; null when it is not the key's. */
	numeral: string | null;
	/**
	 * The triad's pitch classes when the chord is one of the key's degrees:
	 * what the readout lists before a voicing has loaded. A held chord has no
	 * formula here — its notes are its shape's.
	 */
	triad: readonly number[] | null;
}

/** A shape the player named or wrote: what the neck holds. */
export interface HeldChord {
	root: string;
	suffix: string;
	/** The grip that was written, when it was a grip; null takes the standard one. */
	voicingId: string | null;
}

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** Pitch class of a root in the library's spelling; -1 for one it does not use. */
export function rootPitchClass(root: string): number {
	return ROOT_CHROMATIC_ORDER.indexOf(root);
}

/**
 * The chord `semitones` higher, in the library's spelling. A slash chord's
 * bass note moves with it: C/E up two is D/F♯, not D/E.
 */
export function transposeChord(root: string, suffix: string, semitones: number): { root: string; suffix: string } {
	const pc = rootPitchClass(root);
	if (pc === -1) return { root, suffix };
	const movedRoot = ROOT_CHROMATIC_ORDER[mod12(pc + semitones)];
	if (!isSlashChord(suffix)) return { root: movedRoot, suffix };
	const slash = suffix.indexOf("/");
	const bass = suffix.slice(slash + 1);
	const bassPc = rootPitchClass(bass);
	if (bassPc === -1) return { root: movedRoot, suffix };
	return { root: movedRoot, suffix: `${suffix.slice(0, slash)}/${ROOT_CHROMATIC_ORDER[mod12(bassPc + semitones)]}` };
}

/** One of the key's degrees, as the mode resolves it, in the shared shape. */
export function shownFromKeyChords(sounding: KeyChord, shape: KeyChord): ShownChord {
	return {
		sounding: { root: sounding.root, suffix: sounding.suffix, rootPitchClass: sounding.rootPitchClass },
		shape: { root: shape.root, suffix: shape.suffix, rootPitchClass: shape.rootPitchClass },
		numeral: sounding.numeral,
		triad: sounding.pitchClasses,
	};
}

/**
 * A held shape under the capo. `soundingPitchClasses` are the notes the shape
 * actually sounds, once its voicing is known: the chord is the key's, and gets
 * the key's numeral for its root, only when every one of them is a scale
 * tone. Before the voicing has loaded there is nothing to judge by, and the
 * numeral waits.
 */
export function heldChordView(
	held: HeldChord,
	spec: ScaleSpec,
	capo: number,
	soundingPitchClasses: readonly number[] | null,
): ShownChord {
	const shapePc = rootPitchClass(held.root);
	const moved = transposeChord(held.root, held.suffix, capo);
	const soundingPc = shapePc === -1 ? -1 : mod12(shapePc + capo);
	let numeral: string | null = null;
	if (soundingPc !== -1 && soundingPitchClasses) {
		const scale = new Set(scalePitchClasses(spec));
		const degree = keyChord(spec, soundingPc);
		if (degree.diatonic && soundingPitchClasses.every((pc) => scale.has(mod12(pc)))) numeral = degree.numeral;
	}
	return {
		sounding: { root: moved.root, suffix: moved.suffix, rootPitchClass: soundingPc },
		shape: { root: held.root, suffix: held.suffix, rootPitchClass: shapePc },
		numeral,
		triad: null,
	};
}
