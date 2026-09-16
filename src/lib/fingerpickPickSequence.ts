import type { Duration, FingerpickPattern } from "./fingerpickTypes";
import {
	carryChordMarks,
	makeEmptySlot,
	measureCapacity,
	setFret,
	slotDurationUnits,
	toggleMuted,
} from "./fingerpickEdit";
import { chordFretHints, chordSymbolLabel, effectiveChords } from "./fingerpickChords";
import type { ChordRef } from "./strumPatterns";
import type { ChordVoicing } from "./chordVoicingToVexChords";

/**
 * One beat of a right-hand pattern as typed: the strings plucked together
 * (fingerpick order, 0 = high e), or a rest.
 */
export type PickToken = { strings: number[] } | { rest: true };

export type PickSequenceParse =
	| { ok: true; tokens: PickToken[]; duration: Duration }
	| { ok: false; error: string };

/**
 * The note values a sequence can be written in — plain ones only. The token
 * count picks the value: it must divide the measure evenly, and a count that
 * only fits with dots or triplets is refused rather than guessed.
 */
const PLAIN_DURATIONS: readonly Duration[] = [
	"whole",
	"half",
	"quarter",
	"eighth",
	"sixteenth",
	"32nd",
];

/** Highest string number a token may name (1 = high e … 6 = low E). */
const STRING_COUNT = 6;

/**
 * Read a right-hand picking sequence such as `3212` or `6(32)1(32)`.
 *
 *  - Digits `1`–`6` are string numbers, 1 = high e, 6 = low E, the way a
 *    guitarist counts them; `3212` is G B e B.
 *  - Parentheses group strings plucked together (a pinch): `6(32)1(32)`.
 *  - `0` or `-` is a rest. Whitespace is ignored.
 *
 * The number of tokens sets the note value: `n` tokens divide the measure
 * evenly, so four in 4/4 are quarters and eight are eighths.
 */
export function parsePickSequence(
	input: string,
	timeSignature: [number, number],
): PickSequenceParse {
	const tokens: PickToken[] = [];
	let pinch: number[] | null = null;
	for (const ch of input.replace(/\s+/g, "")) {
		if (ch === "(") {
			if (pinch) return { ok: false, error: "A pinch can't open inside another pinch." };
			pinch = [];
		} else if (ch === ")") {
			if (!pinch) return { ok: false, error: "A ')' has no '(' before it." };
			if (pinch.length === 0) return { ok: false, error: "A pinch needs at least one string." };
			tokens.push({ strings: pinch });
			pinch = null;
		} else if (ch === "0" || ch === "-") {
			if (pinch) return { ok: false, error: "A rest can't be part of a pinch." };
			tokens.push({ rest: true });
		} else if (/^[1-9]$/.test(ch)) {
			const stringNumber = Number(ch);
			if (stringNumber > STRING_COUNT) {
				return { ok: false, error: `There is no string ${stringNumber} — use 1 (high e) to 6 (low E).` };
			}
			const stringIndex = stringNumber - 1;
			if (pinch) {
				if (!pinch.includes(stringIndex)) pinch.push(stringIndex);
			} else {
				tokens.push({ strings: [stringIndex] });
			}
		} else {
			return { ok: false, error: `"${ch}" isn't a string number, a rest (0 or -) or a pinch.` };
		}
	}
	if (pinch) return { ok: false, error: "A pinch was opened with '(' but never closed." };
	if (tokens.length === 0) return { ok: false, error: "Type string numbers, e.g. 3212." };

	const capacity = measureCapacity(timeSignature);
	const duration = PLAIN_DURATIONS.find(
		(d) => slotDurationUnits(d) * tokens.length === capacity,
	);
	if (!duration) {
		const meter = `${timeSignature[0]}/${timeSignature[1]}`;
		return {
			ok: false,
			error: `${tokens.length} note${tokens.length === 1 ? "" : "s"} don't fit a ${meter} measure evenly.`,
		};
	}
	return { ok: true, tokens, duration };
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

	const fresh = parsed.tokens.map((token) =>
		"rest" in token
			? { ...makeEmptySlot(parsed.duration), isRest: true }
			: makeEmptySlot(parsed.duration),
	);
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

	parsed.tokens.forEach((token, slotIndex) => {
		if ("rest" in token) return;
		const ref = chords[slotIndex];
		const voicing = ref ? voicingFor(ref) : null;
		const hints = voicing ? chordFretHints(voicing) : null;
		if (ref && !voicing) noShape.add(chordSymbolLabel(ref));
		for (const stringIndex of token.strings) {
			const cell = { measureIndex, slotIndex, stringIndex };
			const hint = hints ? hints[stringIndex] : 0;
			if (hint === "/") {
				next = toggleMuted(next, cell);
				const label = chordSymbolLabel(ref as ChordRef);
				if (!leftOut.has(label)) leftOut.set(label, new Set());
				leftOut.get(label)!.add(stringIndex + 1);
			} else {
				next = setFret(next, cell, hint);
				if (!ref) openWritten = true;
			}
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
