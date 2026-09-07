import {
	CHORD_SHAPE_WINDOW,
	MUTED,
	suggestFingers,
	type ChordShape,
	type ShapeFret,
} from "@/lib/chordShape";

/**
 * A chord shape written the way a tab writes it: one fret per string, read from
 * the first string down to the sixth — `00750x` is Em7/A.
 *
 * That is the order a player reads off a tab, where the high e is the top line,
 * and it is the reverse of every internal shape in the app (`ChordShape.frets`
 * is low E first, matching `GUITAR_OPEN_MIDI`). The flip happens here, once, so
 * no caller has to remember which way round it is holding a shape.
 */

/** Strings on the instrument, and so entries a sequence must have. */
export const TAB_STRING_COUNT = 6;

/**
 * Highest fret a typed sequence may name. Past this it is far more likely to be
 * a typo than a note anyone is fretting.
 */
export const MAX_TAB_FRET = 24;

/** Spaces, commas, dashes and pipes all separate frets in a written sequence. */
const SEPARATOR = /[\s,|-]+/;

/** A sequence written without separators: one character per string. */
const COMPACT = /^[0-9xX]+$/;

export interface TabSequenceParse {
	/** The frets, low E first — the order the rest of the app writes a shape in. */
	frets: ShapeFret[] | null;
	/** Why it could not be read. Null when it could, or when nothing was typed. */
	error: string | null;
}

function readFret(token: string): ShapeFret | null {
	if (token === "x" || token === "X") return MUTED;
	if (!/^\d{1,2}$/.test(token)) return null;
	const fret = Number.parseInt(token, 10);
	return fret <= MAX_TAB_FRET ? fret : null;
}

/**
 * Read a typed sequence into frets.
 *
 * Compact (`00750x`) and separated (`x 10 12 12 12 x`) are both accepted: two
 * digits cannot be told from two strings without a separator, so anything above
 * the ninth fret has to be written spaced out, and a player who writes it spaced
 * out at the third fret should not be told off for it.
 *
 * An empty input is not an error — it is a field nobody has typed in yet.
 */
export function parseTabSequence(input: string): TabSequenceParse {
	const trimmed = input.trim();
	if (trimmed === "") return { frets: null, error: null };

	const tokens = COMPACT.test(trimmed) ? trimmed.split("") : trimmed.split(SEPARATOR);
	if (tokens.length !== TAB_STRING_COUNT) {
		return {
			frets: null,
			error: `A shape has six strings — ${tokens.length} written. Space the frets out for the tenth fret and above.`,
		};
	}

	const read: ShapeFret[] = [];
	for (const token of tokens) {
		const fret = readFret(token);
		if (fret === null) {
			return { frets: null, error: `"${token}" is not a fret — write a number, or x for a muted string.` };
		}
		read.push(fret);
	}

	if (read.every((fret) => fret === MUTED)) {
		return { frets: null, error: "That mutes every string — a shape has to sound something." };
	}

	// Typed first string first, stored low E first.
	return { frets: read.reverse(), error: null };
}

/**
 * The window a set of frets is drawn in: against the nut while everything fits
 * there, and otherwise starting at the lowest fretted note.
 *
 * Open strings are ignored in the choice, not excluded from the shape: an open
 * string sounds whatever the window is, which is exactly why a shape like
 * `x05700` can sit at the fifth fret and still ring two open strings.
 */
export function windowStartFret(frets: readonly ShapeFret[]): number {
	const held = frets.filter((fret): fret is number => typeof fret === "number" && fret > 0);
	if (held.length === 0) return 1;
	return Math.max(...held) <= CHORD_SHAPE_WINDOW ? 1 : Math.min(...held);
}

/**
 * A written sequence as an editable shape, fingering suggested the way the grid
 * suggests one. The shape may still fail validation — a sequence spanning more
 * frets than the window holds is a real thing to type and a real thing to be
 * told about, so it is returned rather than rejected here.
 */
export function tabSequenceToShape(frets: readonly ShapeFret[]): ChordShape {
	const shape: ChordShape = {
		startFret: windowStartFret(frets),
		frets: [...frets],
		fingers: Array.from({ length: TAB_STRING_COUNT }, () => 0),
		barreFret: null,
	};
	return { ...shape, fingers: suggestFingers(shape) };
}

/** A shape written back out as a sequence, first string first. */
export function formatTabSequence(frets: readonly ShapeFret[]): string {
	const written = [...frets].reverse().map((fret) => (fret === MUTED ? "x" : String(fret)));
	// Two-digit frets would run together without separators, and a sequence that
	// cannot be read back is not worth writing.
	return written.some((token) => token.length > 1) ? written.join(" ") : written.join("");
}
