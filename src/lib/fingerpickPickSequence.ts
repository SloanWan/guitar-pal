import type { Duration, FingerpickPattern } from "./fingerpickTypes";
import {
	NOTE_LADDER,
	beatTicks,
	carryChordMarks,
	makeEmptySlot,
	measureCapacity,
	setFret,
	setTied,
	slotDurationUnits,
	toggleMuted,
} from "./fingerpickEdit";
import { chordFretHints, chordRootString, chordSymbolLabel, effectiveChords } from "./fingerpickChords";
import { isCompound } from "./strumMeter";
import type { ChordRef } from "./strumPatterns";
import type { ChordVoicing } from "./chordVoicing";

/**
 * One cell of a right-hand pattern as typed: the strings plucked together
 * (fingerpick order, 0 = high e), a rest, or a hold — the cell before it goes
 * on sounding. `root` is the thumb on whichever string the chord's root is on
 * — `根3231323` — resolved against the chord in effect when the frets are
 * written, never here: `{ strings: [], root: true }` is a root alone,
 * `{ strings: [0], root: true }` a root pinched with high e.
 */
export type PickToken = { strings: number[]; root?: true } | { rest: true } | { hold: true };

/** How a root is written: the character, or the letter a latin keyboard reaches for. */
const ROOT_CHARS = new Set(["根", "R", "r"]);

/**
 * How a hold is written. Both characters are the same token: the sound is the
 * same either way, and whether the tab shows a longer note or a tie is decided
 * by where the hold falls (`foldHolds`), never by which was typed. The
 * full-width forms are what a Chinese keyboard writes for them.
 */
const HOLD_CHARS = new Set(["_", "^", "＿", "＾"]);

export type PickSequenceParse =
	| { ok: true; tokens: PickToken[]; duration: Duration }
	| { ok: false; error: string };

/**
 * The note values a sequence can be written in, by meter. The token count picks
 * the value: it must divide the measure evenly into one of these. A simple
 * meter takes the plain values and the two triplets (twelve in 4/4 are
 * eighth-triplets, nine in 3/4 too); a compound meter takes what its dotted
 * beat divides into — two dotted quarters, six eighths, twelve sixteenths in
 * 6/8 — and never a plain quarter, which would be a hemiola, or a triplet,
 * which its beat already is. Anything else is refused rather than guessed.
 */
const SIMPLE_METER_DURATIONS: readonly Duration[] = [
	"whole",
	"half",
	"quarter",
	"eighth",
	"eighth-triplet",
	"sixteenth",
	"sixteenth-triplet",
	"32nd",
];

const COMPOUND_METER_DURATIONS: readonly Duration[] = [
	"dotted-quarter",
	"eighth",
	"sixteenth",
	"32nd",
];

/** Ticks a quarter-note triplet would weigh (three in a half note) — not a Duration yet. */
const QUARTER_TRIPLET_TICKS = 16;

/** Highest string number a token may name (1 = high e … 6 = low E). */
const STRING_COUNT = 6;

export type PickTokenize =
	| { ok: true; tokens: PickToken[] }
	| { ok: false; error: string };

/**
 * The characters of a picking sequence, read into tokens — with no opinion
 * yet about how long each one lasts.
 *
 *  - Digits `1`–`6` are string numbers, 1 = high e, 6 = low E, the way a
 *    guitarist counts them; `3212` is G B e B.
 *  - Parentheses group strings plucked together (a pinch): `6(32)1(32)`.
 *    Full-width `（ ）` are read the same.
 *  - `根`, `R` or `r` is the root: the string the chord's root sits on,
 *    decided when the frets are written (`chordRootString`). `根3231323`
 *    is the everyday arpeggio that follows the chord change.
 *  - `0` or `-` is a rest. Whitespace is ignored.
 *  - `_` or `^` is a hold: the cell before it keeps sounding one cell longer.
 *    `R_32^132` is the thumb for two cells, then 3 and 2, the 2 held into the
 *    next beat, then 1 3 2. A hold needs a cell before it to hold.
 *
 * Shared by the editor's Pick box, which sizes the notes to the measure, and
 * the tab assistant, which is told the note value and fills measures instead.
 */
export function tokenizePickSequence(input: string): PickTokenize {
	const tokens: PickToken[] = [];
	// The pinch being gathered: its strings, and whether the root is among them.
	let pinch: { strings: number[]; root: boolean } | null = null;
	// Full-width parentheses are what a Chinese keyboard writes: `根3（12）3`.
	for (const ch of input.replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")")) {
		if (ch === "(") {
			if (pinch) return { ok: false, error: "A pinch can't open inside another pinch." };
			pinch = { strings: [], root: false };
		} else if (ch === ")") {
			if (!pinch) return { ok: false, error: "A ')' has no '(' before it." };
			if (pinch.strings.length === 0 && !pinch.root) {
				return { ok: false, error: "A pinch needs at least one string." };
			}
			tokens.push(pinch.root ? { strings: pinch.strings, root: true } : { strings: pinch.strings });
			pinch = null;
		} else if (ch === "0" || ch === "-") {
			if (pinch) return { ok: false, error: "A rest can't be part of a pinch." };
			tokens.push({ rest: true });
		} else if (HOLD_CHARS.has(ch)) {
			if (pinch) return { ok: false, error: "A hold can't be part of a pinch." };
			if (tokens.length === 0) return { ok: false, error: "A hold (_ or ^) needs a note before it to hold." };
			tokens.push({ hold: true });
		} else if (ROOT_CHARS.has(ch)) {
			if (pinch) {
				pinch.root = true;
			} else {
				tokens.push({ strings: [], root: true });
			}
		} else if (/^[1-9]$/.test(ch)) {
			const stringNumber = Number(ch);
			if (stringNumber > STRING_COUNT) {
				return { ok: false, error: `There is no string ${stringNumber} — use 1 (high e) to 6 (low E).` };
			}
			const stringIndex = stringNumber - 1;
			if (pinch) {
				if (!pinch.strings.includes(stringIndex)) pinch.strings.push(stringIndex);
			} else {
				tokens.push({ strings: [stringIndex] });
			}
		} else {
			return { ok: false, error: `"${ch}" isn't a string number, a root (根 or R), a rest (0 or -), a hold (_ or ^) or a pinch.` };
		}
	}
	if (pinch) return { ok: false, error: "A pinch was opened with '(' but never closed." };
	if (tokens.length === 0) return { ok: false, error: "Type string numbers, e.g. 3212." };
	return { ok: true, tokens };
}

/** The plain or dotted value weighing exactly `ticks`, if there is one; triplet values are never returned. */
export function plainDurationForTicks(ticks: number): Duration | null {
	return NOTE_LADDER.find((d) => slotDurationUnits(d) === ticks) ?? null;
}

/** One cell of a sequence before its holds are folded: whether it is a hold, and its length in ticks. */
export interface HoldCell {
	hold: boolean;
	ticks: number;
}

/**
 * A cell after folding: the index of the cell whose note it sounds, how long
 * it now lasts, and whether it continues that note from the cell before —
 * a tie — rather than starting it.
 */
export interface LaidCell {
	source: number;
	ticks: number;
	tied: boolean;
}

/** A triplet cell is never lengthened: its group of three is the unit, and a tie keeps the bracket whole. */
const TRIPLET_TICKS = new Set([slotDurationUnits("eighth-triplet"), slotDurationUnits("sixteenth-triplet")]);

/**
 * Fold the holds of a sequence into the notes before them, the way a
 * copyist would write them: a hold lengthens the note when the longer note
 * is a plain value that stays inside its beat (two sixteenths are an eighth,
 * three a dotted eighth) or lasts whole beats from a place its own size
 * divides (a half note on beat one or three, never on beat two); otherwise
 * — across a beat line, across a bar line, or in a triplet — it is written
 * as a tied note of its own. Positions are
 * bar-relative: `capacity` is the bar, and cells run on into the next bar.
 */
export function foldHolds(cells: readonly HoldCell[], beat: number, capacity: number): LaidCell[] {
	const laid: (LaidCell & { start: number })[] = [];
	let pos = 0;
	for (let i = 0; i < cells.length; i++) {
		const cell = cells[i];
		const prev = laid[laid.length - 1];
		if (!cell.hold || !prev) {
			// A hold with nothing before it is kept as a cell of its own, so the
			// caller still sees every tick; the tokenizer refuses it up front.
			laid.push({ source: i, ticks: cell.ticks, tied: false, start: pos });
		} else {
			const merged = prev.ticks + cell.ticks;
			const startInBar = prev.start % capacity;
			const sameBar = Math.floor(prev.start / capacity) === Math.floor(pos / capacity);
			const insideBeat = Math.floor(startInBar / beat) === Math.floor((startInBar + merged - 1) / beat);
			const wholeBeats = merged % beat === 0 && startInBar % merged === 0;
			const merges =
				sameBar &&
				!TRIPLET_TICKS.has(cell.ticks) &&
				plainDurationForTicks(merged) !== null &&
				startInBar + merged <= capacity &&
				(insideBeat || wholeBeats);
			if (merges) {
				prev.ticks = merged;
			} else {
				laid.push({ source: prev.source, ticks: cell.ticks, tied: true, start: pos });
			}
		}
		pos += cell.ticks;
	}
	return laid.map(({ source, ticks, tied }) => ({ source, ticks, tied }));
}

/**
 * Read a right-hand picking sequence such as `3212` or `6(32)1(32)` for one
 * measure. The number of tokens sets the note value: `n` tokens divide the
 * measure evenly, so four in 4/4 are quarters and eight are eighths.
 */
export function parsePickSequence(
	input: string,
	timeSignature: [number, number],
): PickSequenceParse {
	const tokenized = tokenizePickSequence(input);
	if (!tokenized.ok) return tokenized;
	const { tokens } = tokenized;

	const capacity = measureCapacity(timeSignature);
	const candidates = isCompound(timeSignature) ? COMPOUND_METER_DURATIONS : SIMPLE_METER_DURATIONS;
	const duration = candidates.find((d) => slotDurationUnits(d) * tokens.length === capacity);
	if (!duration) {
		const meter = `${timeSignature[0]}/${timeSignature[1]}`;
		const count = `${tokens.length} note${tokens.length === 1 ? "" : "s"}`;
		if (!isCompound(timeSignature) && capacity === QUARTER_TRIPLET_TICKS * tokens.length) {
			return {
				ok: false,
				error: `${count} in ${meter} would be quarter-note triplets, which the editor doesn't have yet.`,
			};
		}
		return { ok: false, error: `${count} don't fit a ${meter} measure evenly.` };
	}
	return { ok: true, tokens, duration };
}

/**
 * The strings a token plucks over a chord: the ones it names, and the root's
 * string when it asks for one — the one place a root token becomes a string.
 * A root pinched with the string it lands on is that string once.
 */
export function tokenStrings(
	token: Extract<PickToken, { strings: number[] }>,
	chord: ChordRef | null,
	voicing: ChordVoicing | null,
): number[] {
	if (!token.root) return token.strings;
	const root = chordRootString(chord, voicing);
	return token.strings.includes(root) ? token.strings : [...token.strings, root];
}

export interface PickSequenceResult {
	pattern: FingerpickPattern;
	/**
	 * What could not be written as asked, one line each: strings the chord
	 * shape leaves out (written as dead notes so they are seen and fixed), and
	 * a measure with no chord in effect (open strings written).
	 */
	warnings: string[];
}

/**
 * Rewrite one measure from a parsed sequence, fretting each plucked string
 * from the chord in effect at that beat.
 *
 * The measure's chord marks stay where they are in time, so a chord change
 * mid-measure still frets the beats after it from the new shape. A string the
 * shape leaves out becomes a dead note rather than vanishing: in the editor a
 * dead note is played, so the player sees it and changes it. With no chord in
 * effect every plucked string is written open (fret 0).
 *
 * `voicingFor` is injected so the resolution boundary stays testable without
 * a database: it returns the shape a chord is held in, or null if it has none.
 */
export function applyPickSequence(
	pattern: FingerpickPattern,
	measureIndex: number,
	parsed: Extract<PickSequenceParse, { ok: true }>,
	voicingFor: (ref: ChordRef) => ChordVoicing | null,
): PickSequenceResult {
	const measure = pattern.measures[measureIndex];
	if (!measure) return { pattern, warnings: [] };

	// Holds are folded first, so a slot is a note, a rest, or a note carried
	// on from the slot before it; each laid cell remembers the token it sounds.
	const unit = slotDurationUnits(parsed.duration);
	const laid = foldHolds(
		parsed.tokens.map((token) => ({ hold: "hold" in token, ticks: unit })),
		beatTicks(pattern.timeSignature),
		measureCapacity(pattern.timeSignature),
	);
	const fresh = laid.map((cell) => {
		const token = parsed.tokens[cell.source];
		const duration = plainDurationForTicks(cell.ticks) ?? parsed.duration;
		return "rest" in token ? { ...makeEmptySlot(duration), isRest: true } : makeEmptySlot(duration);
	});
	const slots = carryChordMarks(measure.slots, fresh);
	let next: FingerpickPattern = {
		...pattern,
		measures: pattern.measures.map((m, mi) => (mi === measureIndex ? { ...m, slots } : m)),
	};

	const chords = effectiveChords(next.measures)[measureIndex];
	const warnings: string[] = [];
	const leftOut = new Map<string, Set<number>>();
	const noShape = new Set<string>();
	let openWritten = false;
	// The slot each token starts in: a tied slot frets from the chord its
	// note started under, not from one that changed while it was held.
	const headSlot = new Map<number, number>();

	laid.forEach((cell, slotIndex) => {
		const token = parsed.tokens[cell.source];
		if (!("strings" in token)) return;
		if (!cell.tied) headSlot.set(cell.source, slotIndex);
		const ref = chords[headSlot.get(cell.source) ?? slotIndex];
		const voicing = ref ? voicingFor(ref) : null;
		const hints = voicing ? chordFretHints(voicing) : null;
		if (ref && !voicing && !cell.tied) noShape.add(chordSymbolLabel(ref));
		for (const stringIndex of tokenStrings(token, ref, voicing)) {
			const position = { measureIndex, slotIndex, stringIndex };
			const hint = hints ? hints[stringIndex] : 0;
			if (hint === "/") {
				next = toggleMuted(next, position);
				if (!cell.tied) {
					const label = chordSymbolLabel(ref as ChordRef);
					if (!leftOut.has(label)) leftOut.set(label, new Set());
					leftOut.get(label)!.add(stringIndex + 1);
				}
			} else {
				next = setFret(next, position, hint);
				if (!ref && !cell.tied) openWritten = true;
			}
			if (cell.tied) next = setTied(next, position, true);
		}
	});

	for (const [label, strings] of leftOut) {
		const list = [...strings].sort((a, b) => a - b).join(", ");
		warnings.push(
			`String${strings.size === 1 ? "" : "s"} ${list} ${strings.size === 1 ? "is" : "are"} not in the ${label} shape — written as dead notes.`,
		);
	}
	for (const label of noShape) {
		warnings.push(`No shape for ${label} in the library — its beats are written open.`);
	}
	if (openWritten) {
		warnings.push("No chord in effect here — open strings written. Add a chord to fret them.");
	}
	return { pattern: next, warnings };
}
