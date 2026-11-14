import type { FingerpickPattern, Measure, Span } from "@/lib/fingerpickTypes";
import { indexPattern } from "@/lib/fingerpickIndex";
import { cloneMeasureWithFreshIds, copiedSpans, MAX_REPEAT_TIMES } from "@/lib/tabImport/expandRepeats";

/** Total plays for a repeat when no explicit count is set (one loop-back). */
export const DEFAULT_REPEAT_TIMES = 2;

/** The highest pass an ending may name ("8."). */
export const MAX_ENDING = 8;

/** The passes the editor offers as ending toggles: printed music rarely goes past "4.". */
export const ENDING_CHOICES = [1, 2, 3, 4] as const;

/** Clamp an authored play-count to the valid [DEFAULT, MAX] integer range. */
function clampTimes(times: number): number {
	const n = Math.floor(times);
	if (!Number.isFinite(n) || n < DEFAULT_REPEAT_TIMES) return DEFAULT_REPEAT_TIMES;
	return Math.min(n, MAX_REPEAT_TIMES);
}

/** An ending's bracket label as printed: `[1, 2]` → "1.2.". */
export function endingLabel(ending: readonly number[]): string {
	return [...ending].sort((a, b) => a - b).map((pass) => `${pass}.`).join("");
}

export interface PlayOrder {
	/** The original measure indices in the order they sound. */
	order: number[];
	/** First markup error (human-readable, naming the bar), or null when the repeats are sound. */
	error: string | null;
	/** The bar the error names (0-based), so an editor can say it there. */
	errorBar: number | null;
}

/**
 * The passes a `:|` closes. A count written on the bar wins; otherwise a bar
 * among first / second endings plays as many passes as the highest ending of
 * its run of ending bars names (`[1.2. … :|] [3. …]` is three), and a plain
 * `:|` plays twice.
 */
function timesAt(measures: readonly Measure[], i: number): number {
	const written = measures[i].repeatTimes;
	if (written !== undefined) return clampTimes(written);
	return impliedRepeatTimes(measures, i) ?? DEFAULT_REPEAT_TIMES;
}

/**
 * The passes a bar among first / second endings implies for its `:|`: the
 * highest pass named across its run of ending bars (`[1.2. … :|] [3. …]` is
 * three). Null for a bar under no ending, whose count is written or 2.
 */
export function impliedRepeatTimes(measures: readonly Measure[], i: number): number | null {
	if (!measures[i]?.ending) return null;
	let highest = 0;
	for (let j = i; j >= 0 && measures[j].ending; j--) highest = Math.max(highest, ...measures[j].ending!);
	for (let j = i + 1; j < measures.length && measures[j].ending; j++) highest = Math.max(highest, ...measures[j].ending!);
	return clampTimes(highest);
}

/**
 * The bars with one pass turned on or off in bar `index`'s ending: off
 * leaves the others, and the last one off takes the ending away. A count
 * written on the bar goes with a first ending, since the endings set it.
 */
export function toggleEnding(measures: readonly Measure[], index: number, pass: number): Measure[] {
	return measures.map((measure, i) => {
		if (i !== index) return measure;
		const passes = new Set(measure.ending ?? []);
		if (passes.has(pass)) passes.delete(pass);
		else passes.add(pass);
		const next: Measure = { ...measure };
		delete next.ending;
		if (passes.size > 0) {
			next.ending = [...passes].sort((a, b) => a - b);
			delete next.repeatTimes;
		}
		return next;
	});
}

interface Section {
	/** Where a `:|` sends the music back to. */
	start: number;
	/** Opened by a `|:` (rather than the piece's start or the end of the section before). */
	opened: boolean;
	pass: number;
	/** The last `:|` reached in this section; -1 before one is. */
	endBar: number;
}

function sectionAt(start: number, opened = false): Section {
	return { start, opened, pass: 1, endBar: -1 };
}

/**
 * The order a tab's bars sound in, read the way a player reads the page:
 *
 *  - a `:|` sends the music back to the section's `|:` until it has played its
 *    passes; with no `|:` before it, back to the piece's start, or to just
 *    after the section before it;
 *  - a bar under an ending (`Measure.ending`) is played only on the passes it
 *    names, so `|: A [1. B :|] [2. C]` is A B A C, and a `:|` inside a later
 *    ending sends it back again (`[1. B :|] [2. C :|] [3. D]`);
 *  - the section is over once the music passes its last `:|` and its endings.
 *
 * Errors, each naming its bar: a `|:` inside an open repeat (nesting is not
 * supported), a `|:` never closed, and a bar no pass ever reaches (an ending
 * naming a pass its repeat does not play). On an error, `order` holds what was
 * read before it.
 */
export function playOrder(measures: readonly Measure[]): PlayOrder {
	const order: number[] = [];
	let section = sectionAt(0);
	let returned = false;
	let i = 0;
	while (i < measures.length) {
		const measure = measures[i];
		if (section.endBar >= 0 && i > section.endBar && !measure.ending) section = sectionAt(i);
		if (measure.repeatStart && !(returned && i === section.start)) {
			if (section.opened && section.endBar < 0 && i !== section.start) {
				return { order, error: `Bar ${i + 1}: repeat start inside an open repeat (nested repeats are not supported).`, errorBar: i };
			}
			section = sectionAt(i, true);
		}
		returned = false;
		if (measure.ending && !measure.ending.includes(section.pass)) {
			i++;
			continue;
		}
		order.push(i);
		// Every jump spends a pass, so this cannot be reached; it keeps a bad tab from hanging the page.
		if (order.length > measures.length * MAX_REPEAT_TIMES) return { order, error: "The repeats never end.", errorBar: i };
		if (measure.repeatEnd) {
			section.endBar = Math.max(section.endBar, i);
			if (section.pass < timesAt(measures, i)) {
				section.pass++;
				returned = true;
				i = section.start;
				continue;
			}
			section = sectionAt(i + 1);
		}
		i++;
	}
	if (section.opened && section.endBar < 0) {
		return { order, error: `Bar ${section.start + 1}: repeat start without a matching end.`, errorBar: section.start };
	}
	const played = new Set(order);
	const missed = measures.findIndex((_, k) => !played.has(k));
	if (missed !== -1) {
		const ending = measures[missed].ending;
		const what = ending ? `its ending (${endingLabel(ending)}) names a pass its repeat does not play` : "no pass reaches it";
		return { order, error: `Bar ${missed + 1} is never played: ${what}.`, errorBar: missed };
	}
	return { order, error: null, errorBar: null };
}

/** The first problem with a tab's repeats and endings, or null when they play. */
export function repeatMarkupError(measures: readonly Measure[]): string | null {
	return playOrder(measures).error;
}

export interface ExpandedPattern {
	/** The pattern with repeated measures flattened for scheduling. */
	pattern: FingerpickPattern;
	/**
	 * `originMeasureIndices[expandedIndex]` = the ORIGINAL authored measure index that the
	 * expanded measure came from. Lets the playback cursor map an expanded position back to
	 * the single rendered stave. It is `playOrder`'s order itself, so the two cannot drift.
	 */
	originMeasureIndices: number[];
}

/**
 * The pattern's bars in the order they sound, for playback, with the
 * expanded→original index map for cursor mapping. A bar's first time keeps
 * the bar itself; each later time is a copy with fresh ids, and a run of
 * consecutive copies carries the spans lying wholly inside it, so a palm mute
 * or let ring plays on every pass. On invalid markup (or none to expand) the
 * pattern is returned as it is with an identity map — defensive; the editor
 * blocks saving invalid markup, so playback only ever sees sound patterns.
 */
export function expandFingerpickPattern(pattern: FingerpickPattern): ExpandedPattern {
	const identity = pattern.measures.map((_, i) => i);
	const { order, error } = playOrder(pattern.measures);
	if (error || (order.length === identity.length && order.every((origin, k) => origin === k))) {
		return { pattern, originMeasureIndices: identity };
	}
	const spans = pattern.spans ?? [];
	const members = spans.length > 0 ? indexPattern(pattern).spanMembers : null;
	const outSpans: Span[] = [...spans];
	const measures: Measure[] = [];
	const seen = new Set<number>();
	let idMap = new Map<string, string>();
	order.forEach((origin, k) => {
		if (!seen.has(origin)) {
			seen.add(origin);
			measures.push(pattern.measures[origin]);
			return;
		}
		measures.push(cloneMeasureWithFreshIds(pattern.measures[origin], idMap));
		const next = order[k + 1];
		const runEnds = next === undefined || next !== origin + 1 || !seen.has(next);
		if (runEnds) {
			if (members) outSpans.push(...copiedSpans(spans, members, idMap));
			idMap = new Map();
		}
	});
	const expanded: FingerpickPattern = { ...pattern, measures };
	if (pattern.spans !== undefined) expanded.spans = outSpans;
	return { pattern: expanded, originMeasureIndices: order };
}

/**
 * Map an ORIGINAL measure index to its FIRST occurrence in the expanded timeline.
 * Used for click-to-seek: clicking a measure always seeks to its first pass, regardless of
 * which repeat pass is currently playing (intentional — see issue #125). Pure. Falls back to
 * the input index when unmapped (identity / no-repeat case).
 */
export function mapOriginToExpandedIndex(
	originMeasureIndices: number[],
	originIndex: number,
): number {
	const idx = originMeasureIndices.indexOf(originIndex);
	return idx === -1 ? originIndex : idx;
}

/** How a bar's stretch of an ending's bracket is drawn. */
export interface VoltaMark {
	/** The bracket's label ("1.", "1.2.") where it begins; null where it carries on from the bar before. */
	label: string | null;
	/** It ends over this bar with a hook down, where a `:|` sends the music back; a final ending is left open. */
	closed: boolean;
	/** It goes on over the next bar. */
	continues: boolean;
}

function sameEnding(a: Measure, b: Measure): boolean {
	return a.ending !== undefined && b.ending !== undefined && endingLabel(a.ending) === endingLabel(b.ending);
}

/**
 * Each ending bar's part of its bracket, by measure id. Consecutive bars with
 * the same passes share one bracket, labelled at its first bar; it closes
 * with a hook where it ends on a `:|` and stays open on a final ending, as
 * printed. Built from the whole tab so a bracket carries across a row break.
 */
export function voltaMarks(measures: readonly Measure[]): Map<string, VoltaMark> {
	const marks = new Map<string, VoltaMark>();
	measures.forEach((measure, i) => {
		if (!measure.ending) return;
		const prev = measures[i - 1];
		const next = measures[i + 1];
		const continues = next !== undefined && sameEnding(measure, next) && !measure.repeatEnd;
		marks.set(measure.id, {
			label: prev !== undefined && sameEnding(prev, measure) && !prev.repeatEnd ? null : endingLabel(measure.ending),
			closed: !continues && measure.repeatEnd === true,
			continues,
		});
	});
	return marks;
}
