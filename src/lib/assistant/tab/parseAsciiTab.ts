import type { Technique } from "@/lib/fingerpickTypes";
import { DURATION_TICKS, MAX_FRET, measureCapacity } from "@/lib/fingerpickEdit";
import type { ImportedTabDraft, ValidationIssue } from "@/lib/tabImport";
import { barSlots, type DraftSlot, type GridNote } from "@/lib/assistant/tab/draftSlots";

/**
 * A pasted ASCII tab, read into an import draft.
 *
 * ```
 * e|--0--3--|
 * B|--1-----|
 * G|--0-----|
 * D|--2-----|
 * A|--3-----|
 * E|--------|
 * ```
 *
 * ASCII tab writes pitch exactly and rhythm only by spacing, so the frets are
 * read as written and the rhythm is inferred: a bar's width in characters is
 * the bar's length, and the distance from one note to the next is how long the
 * note lasts. That inference is the part a player has to check, and it is
 * reported as a warning wherever it had to guess.
 *
 * The result is a draft, not a pattern: it goes through
 * `validateFingerpickPattern` the way a scanned tab does, and unsupported
 * techniques are dropped there with the same warning.
 */

export interface AsciiTabOptions {
	timeSignature?: [number, number];
}

export type AsciiTabParse =
	| { ok: true; draft: ImportedTabDraft; warnings: ValidationIssue[] }
	| { ok: false; error: string };

/**
 * A line of tab: an optional string label, an optional bar, then one unbroken
 * run of dashes and marks. Any mark is allowed in — an unknown one is
 * reported, not a reason to read the line as prose — but two dashes together
 * are required, which a chord line written `C - G - Am` never has.
 */
const TAB_LINE = /^\s*(?:([eEBGDAa])\s*)?[|:]?\s*(\S*--\S*)\s*$/;

/** The mark before a note that says how it is reached, where the tab can draw it. */
const TECHNIQUE_BEFORE: Record<string, NonNullable<Technique>> = {
	h: "hammer-on",
	p: "pull-off",
	"/": "slide-up",
	"\\": "slide-down",
	s: "slide-up",
	t: "tapping",
};

/** The mark after a note that says what happens to it. */
const TECHNIQUE_AFTER: Record<string, NonNullable<Technique>> = {
	b: "bend-full",
	"~": "vibrato",
};

interface TabLine {
	label: string | null;
	body: string;
}

function readTabLine(line: string): TabLine | null {
	const m = TAB_LINE.exec(line);
	if (!m) return null;
	return { label: m[1] ?? null, body: m[2] };
}

/**
 * Whether the text holds at least one system of six tab lines — what the
 * router asks before anything reads the sentence as words.
 */
export function looksLikeAsciiTab(text: string): boolean {
	return systemsOf(text).length > 0;
}

/** Every block of six consecutive tab lines, top string first. */
function systemsOf(text: string): TabLine[][] {
	const lines = text.split(/\r?\n/);
	const systems: TabLine[][] = [];
	let run: TabLine[] = [];
	for (const line of lines) {
		const tab = readTabLine(line);
		if (tab && line.trim() !== "") {
			run.push(tab);
			if (run.length === 6) {
				systems.push(run);
				run = [];
			}
		} else {
			run = [];
		}
	}
	return systems;
}

/** Lines that are not tab, for whatever else the paste says (a title, a meter). */
export function asciiTabProse(text: string): string {
	return text
		.split(/\r?\n/)
		.filter((line) => line.trim() !== "" && readTabLine(line) === null)
		.join("\n");
}

/** The bars of one system: six strings, each split at its barlines. */
function barsOf(system: TabLine[]): string[][] {
	const perString = system.map((line) =>
		line.body
			.split(/[|:]+/)
			.filter((segment, i, all) => !(segment === "" && (i === 0 || i === all.length - 1))),
	);
	const count = Math.min(...perString.map((s) => s.length));
	const bars: string[][] = [];
	for (let b = 0; b < count; b++) {
		const segments = perString.map((s) => s[b]);
		const width = Math.max(...segments.map((s) => s.length));
		bars.push(segments.map((s) => s.padEnd(width, "-")));
	}
	return bars;
}

/** One fret read out of a run of digits, and where in the run it started. */
export interface FretRunPiece {
	offset: number;
	fret: number;
}

/**
 * A run of digits on one string, read as the frets it was written to mean.
 *
 * Nothing separates one fret from the next in ASCII tab, so `1215` is two
 * notes at the twelfth and fifteenth frets, not the 1215th. Read left to
 * right, longest first: two digits when they make a fret that exists on a
 * neck, one digit otherwise. A leading zero always stands alone — `0` is
 * written `0`, never `03` — which is what keeps two open-ish notes from
 * collapsing into a plausible single fret and going unnoticed.
 *
 * `12` on its own stays the twelfth fret, the way every tab writes it. That
 * one is genuinely ambiguous — it could be a first fret and a second — and the
 * conventional reading is the right guess, not a certainty.
 */
export function splitFretRun(run: string): FretRunPiece[] {
	const pieces: FretRunPiece[] = [];
	let i = 0;
	while (i < run.length) {
		const pair = run.slice(i, i + 2);
		const takesTwo = pair.length === 2 && run[i] !== "0" && Number(pair) <= MAX_FRET;
		pieces.push({ offset: i, fret: Number(takesTwo ? pair : run[i]) });
		i += takesTwo ? 2 : 1;
	}
	return pieces;
}

/** The notes of one bar by the column they start in. */
function notesByColumn(
	bar: string[],
	warnUnknown: (mark: string) => void,
	warnSplit: (run: string, frets: readonly number[]) => void,
): Map<number, GridNote[]> {
	const byColumn = new Map<number, GridNote[]>();
	const add = (col: number, note: GridNote) => {
		if (!byColumn.has(col)) byColumn.set(col, []);
		byColumn.get(col)!.push(note);
	};
	bar.forEach((line, stringIndex) => {
		let c = 0;
		while (c < line.length) {
			const ch = line[c];
			if (/\d/.test(ch)) {
				let end = c + 1;
				while (end < line.length && /\d/.test(line[end])) end += 1;
				const run = line.slice(c, end);
				const pieces = splitFretRun(run);
				if (pieces.length > 1) warnSplit(run, pieces.map((piece) => piece.fret));
				const before = line[c - 1];
				const after = line[end];
				// A mark belongs to the note it touches: the one the run opens
				// with, and the one it closes with.
				pieces.forEach((piece, i) => {
					const opening = i === 0 && before ? TECHNIQUE_BEFORE[before] : undefined;
					const closing = i === pieces.length - 1 && after ? TECHNIQUE_AFTER[after] : undefined;
					add(c + piece.offset, {
						stringIndex,
						fret: piece.fret,
						muted: false,
						technique: opening ?? closing ?? null,
					});
				});
				c = end;
				continue;
			}
			if (ch === "x" || ch === "X") {
				add(c, { stringIndex, fret: null, muted: true, technique: null });
			} else if (
				ch !== "-" &&
				ch !== "(" &&
				ch !== ")" &&
				!(ch in TECHNIQUE_BEFORE) &&
				!(ch in TECHNIQUE_AFTER)
			) {
				warnUnknown(ch);
			}
			c += 1;
		}
	});
	return byColumn;
}

export function parseAsciiTab(text: string, options: AsciiTabOptions = {}): AsciiTabParse {
	const systems = systemsOf(text);
	if (systems.length === 0) return { ok: false, error: "Six lines of tab are needed, one per string." };

	const timeSignature = options.timeSignature ?? [4, 4];
	const capacity = measureCapacity(timeSignature);
	const warnings: ValidationIssue[] = [];
	const unknownMarks = new Set<string>();
	const splitRuns = new Map<string, string>();

	// Labels settle which way up the system is: "e" on top is the usual way
	// and the default; "E" on top with "e" at the bottom is written low-first.
	const reversed = systems.some((s) => s[0].label === "E" && s[5].label === "e");

	const measures: { slots: DraftSlot[] }[] = [];
	for (const system of systems) {
		const oriented = reversed ? [...system].reverse() : system;
		for (const bar of barsOf(oriented)) {
			const width = bar[0].length;
			if (width === 0) continue;
			const byColumn = notesByColumn(
				bar,
				(mark) => unknownMarks.add(mark),
				(run, frets) => splitRuns.set(run, frets.join(", ")),
			);
			const measureIndex = measures.length;

			// A bar's width is its length. When the characters divide the bar
			// into note values — a whole number of 32nds each — every column is
			// a clean fraction of it; otherwise the nearest such fit is taken
			// and the bar is flagged for checking.
			const smallest = DURATION_TICKS["32nd"];
			let unit = capacity / width;
			if (!Number.isInteger(unit) || unit % smallest !== 0) {
				unit = Math.max(smallest, Math.round(unit / smallest) * smallest);
				warnings.push({
					code: "ASCII_UNEVEN_BAR",
					path: `measures[${measureIndex}]`,
					message: `Bar ${measureIndex + 1} is ${width} characters wide, which does not divide the bar evenly — its rhythm was guessed from the spacing.`,
				});
			}

			const { slots, overflow } = barSlots(byColumn, width, unit, capacity);
			if (overflow) {
				warnings.push({
					code: "ASCII_BAR_OVERFLOW",
					path: `measures[${measureIndex}]`,
					message: `Bar ${measureIndex + 1} ran past ${timeSignature[0]}/${timeSignature[1]} — what did not fit was dropped.`,
				});
			}
			measures.push({ slots });
		}
	}

	if (measures.length === 0) return { ok: false, error: "The tab has no bars in it." };

	for (const [run, frets] of splitRuns) {
		warnings.push({
			code: "ASCII_FRET_RUN_SPLIT",
			path: "",
			message: `"${run}" sits on one string with nothing between the frets — it was read as ${frets}.`,
			original: run,
			repairedTo: frets,
		});
	}

	for (const mark of unknownMarks) {
		warnings.push({
			code: "ASCII_UNKNOWN_MARK",
			path: "",
			message: `"${mark}" is not a mark this reader knows — it was skipped.`,
			original: mark,
		});
	}

	return { ok: true, draft: { timeSignature, measures }, warnings };
}
