import type { Technique } from "@/lib/fingerpickTypes";

/**
 * A text tab, read into columns.
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
 * Text tab writes pitch exactly — a fret on a string — and order exactly —
 * left to right — and rhythm not at all, beyond how far apart the notes were
 * typed. So this reads what the text does hold: for every bar, its width in
 * characters and every column that starts a note, with the notes stacked in
 * it. What a column *lasts* is not read here; the readings in `readings.ts`
 * each answer that a different way, and the player picks one by ear (#228).
 */

/** One note as typed: which string, which fret (null for a muted `x`), how it is reached. */
export interface TextTabNote {
	/** 0 = the top line (high e when labelled the usual way). */
	stringIndex: number;
	fret: number | null;
	muted: boolean;
	technique: Technique;
}

/** A column that starts at least one note. */
export interface TextTabColumn {
	/** Character offset from the bar's start. */
	at: number;
	notes: TextTabNote[];
}

/** One bar as typed: its width in characters and its columns, left to right. */
export interface TextTabBar {
	width: number;
	columns: TextTabColumn[];
}

export interface TextTabColumns {
	bars: TextTabBar[];
	/** Characters the reader did not know — reported, then skipped. */
	unknownMarks: string[];
}

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

/**
 * Whether the text holds at least one system of six tab lines — what a
 * router asks before anything reads the sentence as words.
 */
export function looksLikeTextTab(text: string): boolean {
	return systemsOf(text).length > 0;
}

/** Lines that are not tab, for whatever else the paste says (a title, a meter). */
export function textTabProse(text: string): string {
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

/** The notes of one bar by the column they start in. */
function notesByColumn(bar: string[], warnUnknown: (mark: string) => void): Map<number, TextTabNote[]> {
	const byColumn = new Map<number, TextTabNote[]>();
	const add = (col: number, note: TextTabNote) => {
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
				const before = line[c - 1];
				const after = line[end];
				const technique =
					(before && TECHNIQUE_BEFORE[before]) || (after && TECHNIQUE_AFTER[after]) || null;
				add(c, { stringIndex, fret: Number(line.slice(c, end)), muted: false, technique });
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

/**
 * The text's bars and columns, or null when it holds no system of six
 * lines. Labels settle which way up a system is: "e" on top is the usual
 * way and the default; "E" on top with "e" at the bottom is written
 * low-first and is turned over. Empty bars (a `||` with nothing between)
 * are skipped.
 */
export function readTextTab(text: string): TextTabColumns | null {
	const systems = systemsOf(text);
	if (systems.length === 0) return null;
	const reversed = systems.some((s) => s[0].label === "E" && s[5].label === "e");
	const unknown = new Set<string>();
	const bars: TextTabBar[] = [];
	for (const system of systems) {
		const oriented = reversed ? [...system].reverse() : system;
		for (const bar of barsOf(oriented)) {
			const width = bar[0].length;
			if (width === 0) continue;
			const byColumn = notesByColumn(bar, (mark) => unknown.add(mark));
			const columns = [...byColumn.entries()]
				.sort(([a], [b]) => a - b)
				.map(([at, notes]) => ({ at, notes }));
			bars.push({ width, columns });
		}
	}
	return { bars, unknownMarks: [...unknown] };
}
