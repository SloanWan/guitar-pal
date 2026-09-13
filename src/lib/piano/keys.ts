/**
 * The keys of a piano keyboard as data: which are black, where each sits, and
 * what it is called. Nothing about drawing — the component turns white-key
 * indices into pixels, this only counts.
 *
 * Spelling follows `SCALE_ROOTS` (Db, Eb, F#, Ab, Bb) so a key on the piano
 * and the root it selects on the fretboard read the same.
 */
import { SCALE_ROOTS } from "@/lib/fretboard/scales";

export interface PianoKey {
	midi: number;
	/** 0..11, C = 0. */
	pitchClass: number;
	/** The pitch class spelled the way `SCALE_ROOTS` spells it: "Eb", "F#". */
	name: string;
	/** Scientific pitch octave: C4 is 60. */
	octave: number;
	isBlack: boolean;
	/**
	 * White keys: this key's index among the white keys, left to right.
	 * Black keys: the index of the white key on their left; the black key
	 * straddles that key's right edge.
	 */
	whiteIndex: number;
}

export interface PianoRange {
	fromMidi: number;
	toMidi: number;
}

/** 61 keys, C2 to C7: covers the 22-fret guitar neck (E2–D6) with a margin. */
export const PIANO_61: PianoRange = { fromMidi: 36, toMidi: 96 };

const BLACK_PITCH_CLASSES: ReadonlySet<number> = new Set([1, 3, 6, 8, 10]);

export function pitchClassOf(midi: number): number {
	return ((midi % 12) + 12) % 12;
}

export function isBlackKey(midi: number): boolean {
	return BLACK_PITCH_CLASSES.has(pitchClassOf(midi));
}

/** Scientific pitch name, "C4", "F#2" — for labels and accessible names. */
export function keyLabel(midi: number): string {
	return `${SCALE_ROOTS[pitchClassOf(midi)]}${Math.floor(midi / 12) - 1}`;
}

/**
 * Every key from `fromMidi` to `toMidi` inclusive, low to high. Both ends must
 * be white keys: a keyboard that starts or ends on a black key has no white
 * key for that black key to sit against.
 */
export function pianoKeys({ fromMidi, toMidi }: PianoRange): PianoKey[] {
	if (toMidi < fromMidi) throw new Error(`Empty piano range ${fromMidi}..${toMidi}`);
	if (isBlackKey(fromMidi) || isBlackKey(toMidi)) {
		throw new Error(`Piano range ${fromMidi}..${toMidi} must start and end on a white key`);
	}
	const keys: PianoKey[] = [];
	let whites = 0;
	for (let midi = fromMidi; midi <= toMidi; midi++) {
		const pitchClass = pitchClassOf(midi);
		const isBlack = BLACK_PITCH_CLASSES.has(pitchClass);
		keys.push({
			midi,
			pitchClass,
			name: SCALE_ROOTS[pitchClass],
			octave: Math.floor(midi / 12) - 1,
			isBlack,
			whiteIndex: isBlack ? whites - 1 : whites++,
		});
	}
	return keys;
}

/** How many white keys a range has: the keyboard's width in white-key units. */
export function whiteKeyCount(range: PianoRange): number {
	return pianoKeys(range).filter((k) => !k.isBlack).length;
}
