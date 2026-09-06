import type { Beat, StepValue } from "@/lib/strumPatterns";
import { MAX_CELLS_PER_BEAT } from "@/lib/strumBars";

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
	return Math.min(raw, MAX_CELLS_PER_BEAT);
}

/**
 * Ghost cells mark the hand still travelling between strikes, and rests mark it
 * stopped. Derived from the shipped presets rather than invented: every unstruck
 * cell between the first and last strike is a ghost, plus the single cell after
 * the last strike (the return stroke), and everything else is a rest. The
 * direction follows the cell's position in its beat — even down, odd up.
 */
function fillUnstruckCells(cells: (StepValue | null)[], cellsPerBeat: number): StepValue[] {
	let first = -1;
	let last = -1;
	for (let i = 0; i < cells.length; i++) {
		if (cells[i] !== null) {
			if (first === -1) first = i;
			last = i;
		}
	}
	if (first === -1) return cells.map(() => "" as StepValue);

	return cells.map((cell, i) => {
		if (cell !== null) return cell;
		const ghosted = i > first && (i < last || i === last + 1);
		if (!ghosted) return "" as StepValue;
		return i % cellsPerBeat % 2 === 0 ? "DG" : "UG";
	});
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

	const filled = fillUnstruckCells(cells, perBeat);
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
	if (
		requested !== undefined &&
		(!Number.isInteger(requested) || requested < 1 || requested > MAX_CELLS_PER_BEAT)
	) {
		errors.push({
			code: "invalid-options",
			message: `cellsPerBeat must be an integer in 1..${MAX_CELLS_PER_BEAT}.`,
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
