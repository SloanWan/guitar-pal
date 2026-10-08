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

/**
 * What follows a fret and says what is done to the note once struck, the way
 * tab writes it: `7b9` bends 7 up to the pitch of 9, `7b8r` lets it back
 * down, `7pb9` is bent before the pick, `5b¼` a quarter bend; `7~` vibrato
 * and `7~~` the wide kind (a longer run of tildes is a held vibrato, not a
 * wider one). The whole mark is consumed, so the `9` in `7b9` is never read
 * as a second note.
 */
const NOTE_SUFFIX = /^(pb|b)(?:(¼|1\/4)|(\d{1,2}))?(r(?:\d{1,2})?)?|^~+/;

/** A `P.M.` / `let ring` line under a system: its label, then dashes to the run's end. */
const BRACKET_RUN = /(P\.?\s?M\.?|let\s?ring|L\.?R\.?)(?:\s?-+)?/gi;
const BRACKET_LINE = /^\s*(?:P\.?\s?M\.?|let\s?ring|L\.?R\.?)(?![A-Za-z0-9])/i;

interface TabLine {
	label: string | null;
	body: string;
	/** Where `body` starts in the raw line, so a bracket line below can be aligned to it. */
	bodyStart: number;
}

/** A bracket line's runs, in raw-line columns (end exclusive). */
interface BracketRun {
	flag: "palmMute" | "letRing";
	start: number;
	end: number;
}

function isBracketLine(line: string): boolean {
	return BRACKET_LINE.test(line);
}

function bracketRuns(line: string): BracketRun[] {
	const runs: BracketRun[] = [];
	for (const m of line.matchAll(BRACKET_RUN)) {
		const flag = /^l/i.test(m[1]) ? "letRing" : "palmMute";
		const start = m.index ?? 0;
		runs.push({ flag, start, end: start + m[0].length });
	}
	return runs;
}

function readTabLine(line: string): TabLine | null {
	if (isBracketLine(line)) return null;
	const m = TAB_LINE.exec(line);
	if (!m) return null;
	return { label: m[1] ?? null, body: m[2], bodyStart: line.indexOf(m[2]) };
}

/**
 * Whether the text holds at least one system of six tab lines — what the
 * router asks before anything reads the sentence as words.
 */
export function looksLikeAsciiTab(text: string): boolean {
	return systemsOf(text).length > 0;
}

/** Six tab lines, top string first, and the bracket lines written under them. */
interface TabSystem {
	lines: TabLine[];
	brackets: BracketRun[];
}

/** Every block of six consecutive tab lines, each with the `P.M.` / `let ring` lines that follow it. */
function systemsOf(text: string): TabSystem[] {
	const lines = text.split(/\r?\n/);
	const systems: TabSystem[] = [];
	let run: TabLine[] = [];
	for (const line of lines) {
		if (isBracketLine(line)) {
			const last = systems[systems.length - 1];
			if (last && run.length === 0) last.brackets.push(...bracketRuns(line));
			continue;
		}
		const tab = readTabLine(line);
		if (tab && line.trim() !== "") {
			run.push(tab);
			if (run.length === 6) {
				systems.push({ lines: run, brackets: [] });
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
		.filter((line) => line.trim() !== "" && !isBracketLine(line) && readTabLine(line) === null)
		.join("\n");
}

/** One bar of a system: six strings, and where the bar starts in the top string's raw line. */
interface TabBar {
	strings: string[];
	/** Raw-line column of the bar's first character on the top string, for the bracket lines. */
	rawStart: number;
}

/** The bars of one system: six strings, each split at its barlines. */
function barsOf(system: TabLine[]): TabBar[] {
	const perString = system.map((line) => {
		const segments: { text: string; start: number }[] = [];
		let at = 0;
		for (const piece of line.body.split(/([|:]+)/)) {
			if (!/^[|:]+$/.test(piece)) segments.push({ text: piece, start: at });
			at += piece.length;
		}
		return segments.filter((segment, i, all) => !(segment.text === "" && (i === 0 || i === all.length - 1)));
	});
	const count = Math.min(...perString.map((s) => s.length));
	const bars: TabBar[] = [];
	for (let b = 0; b < count; b++) {
		const segments = perString.map((s) => s[b]);
		const width = Math.max(...segments.map((s) => s.text.length));
		bars.push({
			strings: segments.map((s) => s.text.padEnd(width, "-")),
			rawStart: system[0].bodyStart + segments[0].start,
		});
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

/** What a note's suffix mark means, with the bend height it names. */
function readSuffix(
	text: string,
	fret: number,
	warnBend: (text: string, frets: number) => void,
): { length: number; technique: NonNullable<Technique>; bendTarget?: number } | null {
	const m = NOTE_SUFFIX.exec(text);
	if (!m) return null;
	if (m[0].startsWith("~")) {
		return { length: m[0].length, technique: m[0].length === 2 ? "vibrato-wide" : "vibrato" };
	}
	const pre = m[1] === "pb";
	const release = m[4] !== undefined;
	let semitones = 2;
	if (m[2] !== undefined) semitones = 0.5;
	else if (m[3] !== undefined) {
		const diff = Number(m[3]) - fret;
		if (diff === 1) semitones = 1;
		else if (diff > 2) warnBend(m[0], diff);
		// Anything else — the target written as the fret itself, or below it — reads as a full bend.
	}
	let technique: NonNullable<Technique>;
	if (pre) technique = release ? "pre-bend-release" : "pre-bend";
	else if (release) technique = "bend-release";
	else technique = semitones === 0.5 ? "bend-quarter" : semitones === 1 ? "bend-half" : "bend-full";
	return { length: m[0].length, technique, bendTarget: semitones };
}

/** The notes of one bar by the column they start in. */
function notesByColumn(
	bar: string[],
	warnUnknown: (mark: string) => void,
	warnSplit: (run: string, frets: readonly number[]) => void,
	warnBend: (text: string, frets: number) => void,
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
				const last = pieces[pieces.length - 1];
				const suffix = readSuffix(line.slice(end), last.fret, warnBend);
				// A mark belongs to the note it touches: the one the run opens
				// with, and the one it closes with.
				pieces.forEach((piece, i) => {
					const opening = i === 0 && before ? TECHNIQUE_BEFORE[before] : undefined;
					const closing = i === pieces.length - 1 && suffix ? suffix : undefined;
					add(c + piece.offset, {
						stringIndex,
						fret: piece.fret,
						muted: false,
						technique: opening ?? closing?.technique ?? null,
						...(!opening && closing?.bendTarget !== undefined ? { bendTarget: closing.bendTarget } : {}),
					});
				});
				c = end + (suffix?.length ?? 0);
				continue;
			}
			if (ch === "x" || ch === "X") {
				add(c, { stringIndex, fret: null, muted: true, technique: null });
			} else if (ch !== "-" && ch !== "(" && ch !== ")" && ch !== "~" && ch !== "b" && ch !== "r" && !(ch in TECHNIQUE_BEFORE)) {
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
	const wideBends = new Map<string, number>();

	// Labels settle which way up the system is: "e" on top is the usual way
	// and the default; "E" on top with "e" at the bottom is written low-first.
	const reversed = systems.some((s) => s.lines[0].label === "E" && s.lines[5].label === "e");

	const measures: { slots: DraftSlot[] }[] = [];
	for (const system of systems) {
		const oriented = reversed ? [...system.lines].reverse() : system.lines;
		for (const bar of barsOf(oriented)) {
			const width = bar.strings[0].length;
			if (width === 0) continue;
			const byColumn = notesByColumn(
				bar.strings,
				(mark) => unknownMarks.add(mark),
				(run, frets) => splitRuns.set(run, frets.join(", ")),
				(text, frets) => wideBends.set(text, frets),
			);
			// A bracket under a column marks every note struck in it.
			for (const run of system.brackets) {
				for (const [column, notes] of byColumn) {
					const raw = bar.rawStart + column;
					if (raw >= run.start && raw < run.end) for (const note of notes) note[run.flag] = true;
				}
			}
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

	for (const [text, frets] of wideBends) {
		warnings.push({
			code: "ASCII_BEND_CLAMPED",
			path: "",
			message: `"${text}" bends ${frets} frets up — the app plays bends up to a whole tone, so it was read as a full bend.`,
			original: text,
			repairedTo: "bend-full",
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
