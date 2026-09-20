import type { Duration, Technique } from "@/lib/fingerpickTypes";
import { DURATION_TICKS, measureCapacity } from "@/lib/fingerpickEdit";
import { isCompound, type Meter } from "@/lib/strumMeter";
import type { ImportedTabDraft, ValidationIssue } from "@/lib/tabImport";
import { splitTicks } from "@/lib/textTab/ticks";
import type { TextTabBar, TextTabColumn, TextTabColumns, TextTabNote } from "@/lib/textTab/columns";

/**
 * The readings of a text tab: the same columns, each given a duration a
 * different way. Text carries none, so every reading is a guess the player
 * checks by ear (#228); a reading says in its warnings what it guessed.
 *
 * - `spacing`: the bar's width is its length and the gap to the next note is
 *   the note's length — the reading a well-typed tab is written for.
 * - `eighths` / `sixteenths`: every column one note value, the typed spacing
 *   ignored; a bar with fewer notes ends in rests, one with more runs on
 *   into the next.
 * - `swing`: columns in pairs, long–short, three triplet eighths to the beat;
 *   simple meters only.
 *
 * Each is a draft, not a pattern: it goes through the import chain
 * (`normalizeImportedPattern`) like a pasted or scanned tab, where anything
 * the editor cannot hold is repaired or dropped with a warning.
 */

export type TextTabReadingId = "spacing" | "eighths" | "sixteenths" | "swing";

export interface TextTabReading {
	id: TextTabReadingId;
	label: string;
	/** One sentence on how the rhythm was decided, for the player choosing. */
	description: string;
	draft: ImportedTabDraft;
	warnings: ValidationIssue[];
}

export const READING_LABEL: Record<TextTabReadingId, string> = {
	spacing: "By spacing",
	eighths: "Straight eighths",
	sixteenths: "Sixteenths",
	swing: "Swung eighths",
};

export const READING_DESCRIPTION: Record<TextTabReadingId, string> = {
	spacing: "A wider gap is a longer note; the bar's width is its length.",
	eighths: "Every note an eighth, however it was spaced.",
	sixteenths: "Every note a sixteenth, however it was spaced.",
	swing: "Notes in pairs, long–short, three to a beat.",
};

type DraftString = { fret: number | null; technique: Technique; tied: boolean; muted: boolean };

type DraftSlot = {
	duration: Duration;
	isRest?: boolean;
	strings: DraftString[];
};

type DraftMeasure = { slots: DraftSlot[] };

function emptyStrings(): DraftString[] {
	return Array.from({ length: 6 }, () => ({ fret: null, technique: null, tied: false, muted: false }));
}

function struck(notes: TextTabNote[]): DraftString[] {
	const strings = emptyStrings();
	for (const note of notes) {
		strings[note.stringIndex] = { fret: note.fret, technique: note.technique, tied: false, muted: note.muted };
	}
	return strings;
}

/** The same strings, sounding on from the slot before: the tied half of a long note. */
function held(notes: TextTabNote[]): DraftString[] {
	const strings = emptyStrings();
	for (const note of notes) {
		if (note.fret === null) continue;
		strings[note.stringIndex] = { fret: note.fret, technique: null, tied: true, muted: false };
	}
	return strings;
}

function rests(ticks: number): DraftSlot[] {
	return splitTicks(ticks).map((duration) => ({ duration, isRest: true, strings: emptyStrings() }));
}

/** "Bars 1, 3" / "Bar 2": the bars a warning is about, 1-based. */
function barList(indices: number[]): string {
	const numbers = indices.map((i) => i + 1).join(", ");
	return `${indices.length === 1 ? "Bar" : "Bars"} ${numbers}`;
}

// ─── By spacing ───────────────────────────────────────────────────────────────

/**
 * The bar's width in characters is the bar's length, and the distance from
 * one note to the next is how long the note lasts. When the characters
 * divide the bar into note values — a whole number of 32nds each — every
 * column is a clean fraction of it; otherwise the nearest such fit is taken
 * and the bar is flagged for checking.
 */
export function spacingReading(columns: TextTabColumns, timeSignature: Meter): TextTabReading {
	const capacity = measureCapacity(timeSignature);
	const smallest = DURATION_TICKS["32nd"];
	const warnings: ValidationIssue[] = [];
	const measures: DraftMeasure[] = [];

	columns.bars.forEach((bar, measureIndex) => {
		const { width } = bar;
		let unit = capacity / width;
		if (!Number.isInteger(unit) || unit % smallest !== 0) {
			unit = Math.max(smallest, Math.round(unit / smallest) * smallest);
			warnings.push({
				code: "ASCII_UNEVEN_BAR",
				path: `measures[${measureIndex}]`,
				message: `Bar ${measureIndex + 1} is ${width} characters wide, which does not divide the bar evenly — its rhythm was guessed from the spacing.`,
			});
		}

		const slots: DraftSlot[] = [];
		let used = 0;
		const push = (durations: Duration[], first: TextTabNote[] | null) => {
			durations.forEach((duration, i) => {
				const ticks = DURATION_TICKS[duration];
				if (used + ticks > capacity) return;
				used += ticks;
				slots.push(
					i === 0 && first
						? { duration, strings: struck(first) }
						: { duration, isRest: true, strings: emptyStrings() },
				);
			});
		};

		const onsets = bar.columns;
		if (onsets.length === 0 || onsets[0].at > 0) {
			push(splitTicks((onsets[0]?.at ?? width) * unit), null);
		}
		onsets.forEach((column, i) => {
			const next = onsets[i + 1]?.at ?? width;
			push(splitTicks((next - column.at) * unit), column.notes);
		});
		if (width * unit > capacity) {
			warnings.push({
				code: "ASCII_BAR_OVERFLOW",
				path: `measures[${measureIndex}]`,
				message: `Bar ${measureIndex + 1} ran past ${timeSignature[0]}/${timeSignature[1]} — what did not fit was dropped.`,
			});
		}
		if (used < capacity) push(splitTicks(capacity - used), null);
		if (slots.length === 0) push(splitTicks(capacity), null);
		measures.push({ slots });
	});

	return {
		id: "spacing",
		label: READING_LABEL.spacing,
		description: READING_DESCRIPTION.spacing,
		draft: { timeSignature, measures },
		warnings,
	};
}

// ─── Every note one value ─────────────────────────────────────────────────────

/**
 * Bars are filled from the columns in order, `ticksPerColumn` at a time,
 * through `slotsFor`. The typed barlines are kept as far as they can be: a
 * typed bar with room left is finished with rests, and one with more notes
 * than fit runs on into a new bar. Both are said in the warnings.
 */
function flowColumns(
	bars: TextTabBar[],
	capacity: number,
	slotsFor: (columns: TextTabColumn[]) => { slots: DraftSlot[]; ticks: number }[],
): { measures: DraftMeasure[]; padded: number[]; split: number[] } {
	const measures: DraftMeasure[] = [];
	const padded: number[] = [];
	const split: number[] = [];
	let current: DraftSlot[] = [];
	let used = 0;
	const flush = () => {
		if (current.length === 0) return;
		measures.push({ slots: current });
		current = [];
		used = 0;
	};

	bars.forEach((bar, barIndex) => {
		const from = measures.length;
		for (const group of slotsFor(bar.columns)) {
			if (used + group.ticks > capacity) {
				// A group that does not fit finishes this bar with rests and starts the next.
				if (used > 0) current.push(...rests(capacity - used));
				flush();
			}
			current.push(...group.slots);
			used += group.ticks;
			if (used >= capacity) flush();
		}
		if (used > 0) {
			current.push(...rests(capacity - used));
			flush();
			padded.push(barIndex);
		}
		if (measures.length - from > 1) split.push(barIndex);
		if (measures.length === from) {
			// An empty typed bar is a bar of rest.
			measures.push({ slots: rests(capacity) });
		}
	});
	return { measures, padded, split };
}

function flowWarnings(
	padded: number[],
	split: number[],
	value: string,
): ValidationIssue[] {
	const warnings: ValidationIssue[] = [];
	if (padded.length > 0) {
		warnings.push({
			code: "TEXT_TAB_BAR_PADDED",
			path: "measures",
			message: `${barList(padded)} had fewer notes than a bar of ${value} and ${padded.length === 1 ? "was" : "were"} filled with rests.`,
		});
	}
	if (split.length > 0) {
		warnings.push({
			code: "TEXT_TAB_BAR_SPLIT",
			path: "measures",
			message: `${barList(split)} had more notes than a bar of ${value} and ${split.length === 1 ? "was" : "were"} split.`,
		});
	}
	return warnings;
}

export function evenReading(
	columns: TextTabColumns,
	timeSignature: Meter,
	value: "eighth" | "sixteenth",
): TextTabReading {
	const capacity = measureCapacity(timeSignature);
	const ticks = DURATION_TICKS[value];
	const { measures, padded, split } = flowColumns(columns.bars, capacity, (cols) =>
		cols.map((column) => ({ slots: [{ duration: value, strings: struck(column.notes) }], ticks })),
	);
	const id: TextTabReadingId = value === "eighth" ? "eighths" : "sixteenths";
	return {
		id,
		label: READING_LABEL[id],
		description: READING_DESCRIPTION[id],
		draft: { timeSignature, measures },
		warnings: flowWarnings(padded, split, value === "eighth" ? "eighths" : "sixteenths"),
	};
}

// ─── Swung eighths ────────────────────────────────────────────────────────────

/**
 * Columns in pairs: the first lasts two triplet eighths (written as one
 * struck and one tied), the second one — the triplet shape a swing feel is
 * notated in, and what the editor's triplet grouping reads back as one
 * beat. A last column without a partner is a whole beat. Simple meters
 * only: a compound meter's eighths are already in threes.
 */
export function swingReading(columns: TextTabColumns, timeSignature: Meter): TextTabReading | null {
	if (isCompound(timeSignature)) return null;
	const capacity = measureCapacity(timeSignature);
	const triplet = DURATION_TICKS["eighth-triplet"];
	const quarter = DURATION_TICKS.quarter;
	const { measures, padded, split } = flowColumns(columns.bars, capacity, (cols) => {
		const groups: { slots: DraftSlot[]; ticks: number }[] = [];
		for (let i = 0; i < cols.length; i += 2) {
			const first = cols[i];
			const second = cols[i + 1];
			if (!second) {
				groups.push({ slots: [{ duration: "quarter", strings: struck(first.notes) }], ticks: quarter });
				continue;
			}
			groups.push({
				slots: [
					{ duration: "eighth-triplet", strings: struck(first.notes) },
					{ duration: "eighth-triplet", strings: held(first.notes) },
					{ duration: "eighth-triplet", strings: struck(second.notes) },
				],
				ticks: 3 * triplet,
			});
		}
		return groups;
	});
	return {
		id: "swing",
		label: READING_LABEL.swing,
		description: READING_DESCRIPTION.swing,
		draft: { timeSignature, measures },
		warnings: flowWarnings(padded, split, "swung eighths"),
	};
}

// ─── All of them ──────────────────────────────────────────────────────────────

/** A reading's rhythm and frets, for telling two readings apart. */
function shapeOf(reading: TextTabReading): string {
	return JSON.stringify(reading.draft.measures);
}

/**
 * Every reading of the columns, in the order they are offered — the plain
 * ones first, the typed spacing, then swing. A reading that comes out the
 * same as one before it (a tab typed a note every two of sixteen columns
 * reads the same by spacing as in eighths) is not offered twice.
 */
export function textTabReadings(columns: TextTabColumns, timeSignature: Meter): TextTabReading[] {
	const all = [
		evenReading(columns, timeSignature, "eighth"),
		evenReading(columns, timeSignature, "sixteenth"),
		spacingReading(columns, timeSignature),
		swingReading(columns, timeSignature),
	].filter((r): r is TextTabReading => r !== null);
	const seen = new Set<string>();
	const unknown: ValidationIssue[] = columns.unknownMarks.map((mark) => ({
		code: "ASCII_UNKNOWN_MARK",
		path: "",
		message: `"${mark}" is not a mark this reader knows — it was skipped.`,
		original: mark,
	}));
	return all
		.filter((reading) => {
			const shape = shapeOf(reading);
			if (seen.has(shape)) return false;
			seen.add(shape);
			return true;
		})
		.map((reading) => ({ ...reading, warnings: [...reading.warnings, ...unknown] }));
}
