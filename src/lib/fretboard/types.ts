/**
 * The fretboard's whole vocabulary. The `<Fretboard/>` component renders a
 * list of these and knows nothing else: scales, chords, CAGED shapes and the
 * improvisation overlay are all pure functions that produce `FretMark[]`, so
 * they share one board instead of each drawing their own.
 */

export type MarkEmphasis = "root" | "chordTone" | "scaleTone" | "muted";

/**
 * Which member of the chord a chord tone is, so the board can colour thirds,
 * fifths and sevenths apart. "extension" covers everything else a voicing may
 * carry: 9ths, 11ths, 13ths, suspended 2nds and 4ths.
 */
export type ChordToneRole = "third" | "fifth" | "seventh" | "extension";

export interface FretMark {
	/** 0..5, low E to high e — the same convention as `GUITAR_OPEN_MIDI`. */
	string: number;
	/** 0 = open string. */
	fret: number;
	/** What the dot says: "A", "b3", or "" — the caller decides. */
	label: string;
	emphasis: MarkEmphasis;
	/** Only meaningful with `emphasis: "chordTone"`; absent when the chord root is unknown. */
	tone?: ChordToneRole;
}

/** The frets a caller wants marks for, or the frets a board shows. Inclusive. */
export interface FretWindow {
	fromFret: number;
	toFret: number;
}

export interface FretboardProps extends FretWindow {
	marks: readonly FretMark[];
}

/** Six strings, always: the model does not do 7-string or bass. */
export const STRING_COUNT = 6;

/** Stable key for a string/fret slot, shared by the board and the overlay. */
export function slotKey(string: number, fret: number): string {
	return `${string}:${fret}`;
}
