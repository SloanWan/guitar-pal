import type { Beat, StepValue } from "@/lib/strumPatterns";
import { MAX_CELLS_PER_BEAT } from "@/lib/strumBars";
import {
	VALID_CELL_COUNTS,
	allowedCellsPerBeat,
	beatsPerBar,
	type Meter,
} from "@/lib/strumMeter";

/**
 * Rhythm notation → `Beat[]`, the inverse of `patternNotation` in
 * strumNotation.ts.
 *
 * This is the deterministic half of the strum assistant (#136): anything the
 * user types that already *is* a rhythm never reaches the model. Keeping it a
 * pure function means the whole path is unit-testable offline and costs nothing
 * to run.
 *
 * The notation is a stream of single-character cells, matching what
 * `patternNotation` writes:
 *
 *   "D DU UD"  →  D _ D U _ U D   (a space is a blank cell, not a separator)
 *
 * That is the repo's existing convention and the reason a space cannot double as
 * a beat separator here. Bars are split on "|".
 */

/** A cell the player strikes, as written. */
const STRUCK: Record<string, StepValue> = {
	D: "D",
	U: "U",
	X: "X",
	// Chinese notation, as used in the Simplified-Chinese guitar-tab convention.
	"上": "U", // 上 — upstroke
	"下": "D", // 下 — downstroke
	"〇": "X", // 〇 — muted
};

/** Characters that mean "this cell is not struck". */
const BLANK_CHARS = new Set([" ", "　", ".", "-", "_", "·"]);

export const MAX_BEATS_PER_BAR = 8;

export interface ParseRhythmOptions {
	/** Beats in each bar. Defaults to 4. */
	beatsPerBar?: number;
	/**
	 * Cells per beat. When omitted it is inferred from the cell count, which is
	 * what free-form input needs: 7 or 8 cells over 4 beats means eighths, 16
	 * means sixteenths.
	 */
	cellsPerBeat?: number;
}

export type RhythmParseErrorCode =
	| "empty"
	| "invalid-character"
	| "too-many-cells"
	| "invalid-options";

export interface RhythmParseError {
	code: RhythmParseErrorCode;
	message: string;
	/** Offset into the original input, when the error is about one character. */
	index?: number;
}

export interface ParsedRhythmBar {
	beats: Beat[];
}

export interface ParsedRhythm {
	bars: ParsedRhythmBar[];
	beatsPerBar: number;
	cellsPerBeat: number;
	/** True when the cell count did not fill the grid and was padded with rests. */
	padded: boolean;
}

export type RhythmParseResult =
	| { ok: true; value: ParsedRhythm }
	| { ok: false; errors: RhythmParseError[] };

/** Every character the parser accepts, for prompts and error messages. */
export function acceptedRhythmCharacters(): string[] {
	return [...Object.keys(STRUCK), ...BLANK_CHARS];
}

function inferCellsPerBeat(cellCount: number, beatsPerBar: number): number {
	const raw = Math.ceil(cellCount / beatsPerBar);
	if (raw <= 1) return 1;
	// A count, not a cap: no meter divides a beat five ways, so a width that is
	// not one a beat actually has rounds up to the next one that is, and stops at
	// the finest division any meter asks for.
	return VALID_CELL_COUNTS.find((count) => count >= raw) ?? MAX_CELLS_PER_BEAT;
}

function parseBar(
	raw: string,
	offset: number,
	beatsPerBar: number,
	cellsPerBeat: number | undefined,
	errors: RhythmParseError[],
): { beats: Beat[]; cellsPerBeat: number; padded: boolean } | null {
	const cells: (StepValue | null)[] = [];
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		const upper = ch.toUpperCase();
		if (STRUCK[upper] !== undefined) {
			cells.push(STRUCK[upper]);
		} else if (BLANK_CHARS.has(ch)) {
			cells.push(null);
		} else {
			errors.push({
				code: "invalid-character",
				message: `"${ch}" is not rhythm notation. Use D, U, X, a space for a blank cell, or "|" between bars.`,
				index: offset + i,
			});
		}
	}

	// Trailing blanks carry no rhythm; patternNotation drops them on write.
	while (cells.length > 0 && cells[cells.length - 1] === null) cells.pop();
	if (cells.length === 0) return null;

	const perBeat = cellsPerBeat ?? inferCellsPerBeat(cells.length, beatsPerBar);
	const total = beatsPerBar * perBeat;
	if (cells.length > total) {
		errors.push({
			code: "too-many-cells",
			message: `${cells.length} cells do not fit ${beatsPerBar} beats of ${perBeat}. Split bars with "|".`,
			index: offset,
		});
		return null;
	}

	const padded = cells.length < total;
	while (cells.length < total) cells.push(null);

	// Literal: one character, one cell, and nothing nobody wrote. The travelling
	// hand is drawn from these cells where the grid is rendered
	// (`ghostedBeats`), so writing it in here would put strokes into the data
	// that the player never typed — and, in the pattern editor, into the grid
	// they are typing at.
	const filled: StepValue[] = cells.map((cell) => cell ?? "");
	const beats: Beat[] = [];
	for (let b = 0; b < beatsPerBar; b++) {
		beats.push(filled.slice(b * perBeat, (b + 1) * perBeat));
	}
	return { beats, cellsPerBeat: perBeat, padded };
}

/**
 * Parses rhythm notation into bars of beats. Never throws: callers get typed
 * errors so the assistant's repair loop can quote them back verbatim.
 */
export function parseRhythm(input: string, options: ParseRhythmOptions = {}): RhythmParseResult {
	const beatsPerBar = options.beatsPerBar ?? 4;
	const errors: RhythmParseError[] = [];

	if (!Number.isInteger(beatsPerBar) || beatsPerBar < 1 || beatsPerBar > MAX_BEATS_PER_BAR) {
		errors.push({
			code: "invalid-options",
			message: `beatsPerBar must be an integer in 1..${MAX_BEATS_PER_BAR}.`,
		});
	}
	const requested = options.cellsPerBeat;
	if (requested !== undefined && !VALID_CELL_COUNTS.includes(requested)) {
		errors.push({
			code: "invalid-options",
			message: `cellsPerBeat must be one of ${VALID_CELL_COUNTS.join(", ")}.`,
		});
	}
	if (errors.length > 0) return { ok: false, errors };

	const bars: ParsedRhythmBar[] = [];
	let cellsPerBeat = requested ?? 0;
	let padded = false;
	let offset = 0;

	for (const chunk of input.split("|")) {
		// Later bars follow the first bar's subdivision, so a multi-bar pattern
		// stays on one grid instead of each bar inferring its own.
		const perBeat = requested ?? (cellsPerBeat > 0 ? cellsPerBeat : undefined);
		const parsed = parseBar(chunk, offset, beatsPerBar, perBeat, errors);
		offset += chunk.length + 1;
		if (parsed === null) continue;
		bars.push({ beats: parsed.beats });
		cellsPerBeat = cellsPerBeat || parsed.cellsPerBeat;
		padded = padded || parsed.padded;
	}

	if (errors.length > 0) return { ok: false, errors };
	if (bars.length === 0) {
		return {
			ok: false,
			errors: [{ code: "empty", message: "No rhythm found. Try something like \"D DU UD\"." }],
		};
	}

	return { ok: true, value: { bars, beatsPerBar, cellsPerBeat, padded } };
}

/**
 * The same parse, told what bar it has to fit.
 *
 * `parseRhythm` infers a subdivision from the cell count alone, which is right
 * for free text but blind to the meter: 4 cells to a beat is a legal division of
 * a quarter and names nothing at all under a dotted one. Here the meter decides
 * the beat count and picks the subdivision from the counts that meter actually
 * has, rounding up to the next one that holds everything written.
 *
 * Two passes rather than one so the tokenizing stays in a single place: the
 * first pass is only consulted for the width it inferred.
 */
export function parseRhythmInMeter(input: string, meter: Meter): RhythmParseResult {
	const beats = beatsPerBar(meter);
	const first = parseRhythm(input, { beatsPerBar: beats });
	if (!first.ok) return first;

	const allowed = allowedCellsPerBeat(meter);
	if (allowed.includes(first.value.cellsPerBeat)) return first;

	// Nothing wider left: re-parse at the widest the meter has so the overflow is
	// reported against a real division rather than an invented one.
	const target =
		allowed.find((count) => count >= first.value.cellsPerBeat) ?? allowed[allowed.length - 1];
	return parseRhythm(input, { beatsPerBar: beats, cellsPerBeat: target });
}
