import type { ChordIndexEntry } from "@/lib/chordSearch";
import { beatTicks, slotDurationUnits } from "@/lib/fingerpickEdit";
import { setSlotChord } from "@/lib/fingerpickChords";
import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import { beatsPerBar } from "@/lib/strumMeter";
import type { ChordRef } from "@/lib/strumPatterns";
import type { ValidationIssue } from "@/lib/tabImport";
import { buildTabProposal } from "@/lib/tabAssistant/buildTabProposal";
import { readTabSentence } from "@/lib/tabAssistant/readTabSentence";
import { routeTabInput } from "@/lib/tabAssistant/router";
import type { VoicingLookup } from "@/lib/tabAssistant/voicings";

/**
 * Reading a request to change a pattern the player already has, bar by bar.
 *
 *     add to travis: string:6654, fret:8-11-10-8; Am: 5 3 2 1
 *     replace bar 2 of travis: C: 5/4 2 1 3
 *     add chord Am to bar 2 beat 3 of travis
 *     lick bars 1-4: C G Am F
 *     给 travis 加：string:6654, fret:8-11-10-8
 *     把 travis 的第 2 小节改成 Am: 5 3 2 1
 *     给 lick 第 2 小节第 3 拍加和弦 Am
 *
 * A verb, a name the library carries, and what to write — bars, each
 * written the way a new pattern is written, or chord marks for bars that
 * are already there. Nothing here is a new grammar: bars go through the
 * same readers, built to the target's meter, chords through the chord
 * reader, and the result is put in front of the player before a row is
 * touched. Presets cannot be edited; a change to one becomes a copy.
 */

export type TabEditOp = "append" | "replace" | "chords";

/** How the target was named, before the library is consulted. */
interface EditClause {
	op: TabEditOp;
	name: string;
	/** 1-based, as the player counts bars; only for a replace or a chord mark. */
	bar: number | null;
	/** The last bar of a range, 1-based, when one was named. */
	barTo: number | null;
	/** 1-based; where in the bar a chord mark goes. Null means the first beat. */
	beat: number | null;
	/** Everything after the colon: the bars to write, or the chords to mark. */
	spec: string;
}

/** "add chord Am to bar 2 beat 3 of lick", "mark C G Am F on bars 1-4 of lick". */
const CHORDS_VERB_EN =
	/^\s*(?:(?:add|set|put|write)\s+(?:the\s+)?chords?|mark(?:\s+(?:the\s+)?chords?)?)\s+(.+?)\s+(?:to|on|at|in|over)\s+bars?\s+(\d+)(?:\s*(?:[-–]|to)\s*(\d+))?(?:\s*,?\s*(?:on\s+)?beat\s+(\d+))?\s+(?:of|in|on)\s+(.+?)\s*$/i;
/** "lick bar 2 beat 3: Am", "chords for lick bars 1-4: C G Am F". */
const CHORDS_COLON_EN =
	/^\s*(?:chords?\s+(?:for|on|in|over)\s+)?(.+?)\s+bars?\s+(\d+)(?:\s*(?:[-–]|to)\s*(\d+))?(?:\s*,?\s*(?:on\s+)?beat\s+(\d+))?\s*[:：]\s*(.+)$/i;
/** "给 lick 第 2 小节第 3 拍加和弦 Am", "lick 第 1-4 小节和弦：C G Am F". */
const CHORDS_ZH =
	/^\s*(?:给|在|把|为)?\s*(.+?)\s*的?\s*第\s*(\d+)\s*(?:[-–到至]\s*(\d+))?\s*小节\s*(?:的?\s*第\s*(\d+)\s*拍)?\s*(?:上|里)?\s*(?:加上|添加|标上|标记|加|标|放|配|用|写)?\s*和弦\s*[:：]?\s*(.+)$/;

const APPEND_EN = /^\s*(?:add|append)\s+(?:(?:a\s+)?bars?\s+)?to\s+(.+?)\s*[:：]\s*([\s\S]+)$/i;
const APPEND_ZH = /^\s*(?:给|在|往|向)\s*(.+?)\s*(?:里|中)?\s*(?:加上|添加|追加|加)\s*(?:一?小节|bars?)?\s*[:：]?\s*([\s\S]+)$/;
const REPLACE_EN = /^\s*(?:replace|set|change|rewrite)\s+bar\s+(\d+)\s+(?:of|in|on)\s+(.+?)\s*(?:[:：]|\bto\b|\bwith\b)\s*([\s\S]+)$/i;
const REPLACE_ZH = /^\s*(?:把|将)?\s*(.+?)\s*的?\s*第\s*(\d+)\s*(?:小节|bar)\s*(?:改成|改为|换成|替换成|替换为|改)\s*[:：]?\s*([\s\S]+)$/;

const num = (raw: string | undefined): number | null => (raw === undefined ? null : Number(raw));

function readClause(text: string): EditClause | null {
	// Chord marks first: they say "chord", "beat" or "和弦", which no bar spec does.
	let m = CHORDS_VERB_EN.exec(text);
	if (m) return { op: "chords", spec: m[1], bar: Number(m[2]), barTo: num(m[3]), beat: num(m[4]), name: m[5] };
	m = CHORDS_ZH.exec(text);
	if (m) return { op: "chords", name: m[1], bar: Number(m[2]), barTo: num(m[3]), beat: num(m[4]), spec: m[5] };
	m = CHORDS_COLON_EN.exec(text);
	if (m) return { op: "chords", name: m[1], bar: Number(m[2]), barTo: num(m[3]), beat: num(m[4]), spec: m[5] };
	m = REPLACE_EN.exec(text);
	if (m) return { op: "replace", bar: Number(m[1]), barTo: null, beat: null, name: m[2], spec: m[3] };
	m = REPLACE_ZH.exec(text);
	if (m) return { op: "replace", name: m[1], bar: Number(m[2]), barTo: null, beat: null, spec: m[3] };
	m = APPEND_EN.exec(text);
	if (m) return { op: "append", name: m[1], bar: null, barTo: null, beat: null, spec: m[2] };
	m = APPEND_ZH.exec(text);
	if (m) return { op: "append", name: m[1], bar: null, barTo: null, beat: null, spec: m[2] };
	return null;
}

/** Segments are written one per idea, split at semicolons and line breaks. */
const SEGMENT_SEPARATOR = /[;；\n]+/;

export type TabEditReading =
	| {
			kind: "append";
			pattern: FingerpickPattern;
			measures: Measure[];
			warnings: ValidationIssue[];
	  }
	| {
			kind: "replace";
			pattern: FingerpickPattern;
			/** 0-based. */
			barIndex: number;
			measures: Measure[];
			warnings: ValidationIssue[];
	  }
	| {
			kind: "chords";
			pattern: FingerpickPattern;
			/** 0-based, the first bar touched. */
			barIndex: number;
			/** The bars from `barIndex` on, with the marks written. */
			measures: Measure[];
			/** What was marked where, for the message: 1-based bar and beat. */
			marks: { bar: number; beat: number; chord: ChordRef }[];
			warnings: ValidationIssue[];
	  }
	| { kind: "unknown-pattern"; op: TabEditOp; name: string }
	| { kind: "bar-out-of-range"; op: "replace" | "chords"; pattern: FingerpickPattern; bar: number }
	| { kind: "beat-out-of-range"; op: "chords"; pattern: FingerpickPattern; beat: number }
	| { kind: "chords-mismatch"; op: "chords"; pattern: FingerpickPattern; bars: number; chords: number }
	| { kind: "segment-unread"; op: TabEditOp; pattern: FingerpickPattern; segment: string }
	| { kind: "nothing-to-write"; op: TabEditOp; pattern: FingerpickPattern };

export interface ReadTabEditInput {
	text: string;
	index: readonly ChordIndexEntry[];
	patterns: readonly FingerpickPattern[];
	voicingFor: VoicingLookup;
}

/** Whether the sentence is shaped like an edit at all — read before the shapes are fetched. */
export function tabEditClause(text: string): { op: TabEditOp; name: string; spec: string } | null {
	const clause = readClause(text);
	return clause ? { op: clause.op, name: clause.name, spec: clause.spec } : null;
}

/** The pattern a name refers to: exact, case-insensitive; the library keeps names unique. */
export function findTabPattern(
	name: string,
	patterns: readonly FingerpickPattern[],
): FingerpickPattern | null {
	const wanted = name.trim().toLowerCase().replace(/^["'「『《]|["'」』》]$/g, "");
	return patterns.find((p) => p.name.trim().toLowerCase() === wanted) ?? null;
}

/** The bars a spec describes, built to the target's meter, one segment at a time. */
export function readTabEdit({ text, index, patterns, voicingFor }: ReadTabEditInput): TabEditReading | null {
	const clause = readClause(text);
	if (!clause) return null;

	const pattern = findTabPattern(clause.name, patterns);
	if (!pattern) return { kind: "unknown-pattern", op: clause.op, name: clause.name.trim() };

	if (clause.op !== "append" && (clause.bar === null || clause.bar < 1 || clause.bar > pattern.measures.length)) {
		return { kind: "bar-out-of-range", op: clause.op, pattern, bar: clause.bar ?? 0 };
	}
	if (clause.op === "chords") return readChordMarks(clause, pattern, index);

	const measures: Measure[] = [];
	const warnings: ValidationIssue[] = [];
	const segments = clause.spec.split(SEGMENT_SEPARATOR).map((s) => s.trim()).filter((s) => s !== "");
	if (segments.length === 0) return { kind: "nothing-to-write", op: clause.op, pattern };

	for (const segment of segments) {
		const route = routeTabInput(segment, index);
		if (route.path === "llm" || route.path === "ascii") {
			return { kind: "segment-unread", op: clause.op, pattern, segment };
		}
		const { reading } = route;
		const built = buildTabProposal({
			chordWords: reading.chordWords,
			notes: route.path === "notes" ? reading.notes : null,
			order: route.path === "pick-order" ? reading.order : null,
			duration: reading.duration,
			style: route.path === "style" ? reading.style : null,
			// The target's meter, whatever the segment said: a bar of 3/4 has no
			// place in a 4/4 pattern.
			timeSignature: pattern.timeSignature,
			voicingFor,
		});
		if (!built.ok) return { kind: "segment-unread", op: clause.op, pattern, segment };
		measures.push(...built.proposal.pattern.measures);
		warnings.push(...built.proposal.warnings);
	}

	return clause.op === "append"
		? { kind: "append", pattern, measures, warnings }
		: { kind: "replace", pattern, barIndex: clause.bar! - 1, measures, warnings };
}

/** The slot a beat falls in: the one whose span holds the beat's first tick. */
export function slotAtBeat(measure: Measure, beat: number, timeSignature: [number, number]): number {
	const wanted = (beat - 1) * beatTicks(timeSignature);
	let at = 0;
	for (let i = 0; i < measure.slots.length; i++) {
		const next = at + slotDurationUnits(measure.slots[i].duration);
		if (wanted < next) return i;
		at = next;
	}
	return Math.max(0, measure.slots.length - 1);
}

/**
 * Chord marks over a run of bars. One chord is written on every bar in the
 * range; several are written one per bar, and then the range has to be as
 * long as the list — or absent, in which case the list sets it. The beat is
 * where in each bar the mark goes, the first beat unless one was named.
 */
function readChordMarks(
	clause: EditClause,
	pattern: FingerpickPattern,
	index: readonly ChordIndexEntry[],
): TabEditReading {
	const reading = readTabSentence(clause.spec, index);
	const words = reading.chordWords;
	if (words.length === 0 || reading.leftover !== "") {
		return { kind: "segment-unread", op: "chords", pattern, segment: clause.spec.trim() };
	}

	const beat = clause.beat ?? 1;
	const beats = beatsPerBar(pattern.timeSignature);
	if (beat < 1 || beat > beats) return { kind: "beat-out-of-range", op: "chords", pattern, beat };

	const from = clause.bar!;
	const to = clause.barTo ?? (words.length > 1 ? from + words.length - 1 : from);
	if (to < from || to > pattern.measures.length) {
		return { kind: "bar-out-of-range", op: "chords", pattern, bar: to };
	}
	const count = to - from + 1;
	if (words.length > 1 && words.length !== count) {
		return { kind: "chords-mismatch", op: "chords", pattern, bars: count, chords: words.length };
	}

	const warnings: ValidationIssue[] = [];
	const marks: { bar: number; beat: number; chord: ChordRef }[] = [];
	let next = pattern;
	for (let i = 0; i < count; i++) {
		const word = words.length === 1 ? words[0] : words[i];
		const bar = from + i;
		if (!word.chord) {
			warnings.push({
				code: "UNRESOLVED_CHORD",
				path: `measures[${bar - 1}]`,
				message: `No chord matched "${word.text}" — bar ${bar} was left as it is.`,
				original: word.text,
			});
			continue;
		}
		const measureIndex = bar - 1;
		const slotIndex = slotAtBeat(pattern.measures[measureIndex], beat, pattern.timeSignature);
		next = setSlotChord(next, { measureIndex, slotIndex }, word.chord);
		marks.push({ bar, beat, chord: word.chord });
	}

	return {
		kind: "chords",
		pattern,
		barIndex: from - 1,
		measures: next.measures.slice(from - 1, to),
		marks,
		warnings,
	};
}

/**
 * The pattern as it would be after the edit — what the page writes, and what
 * the card can show. `measures` go on the end, or in place of `replaceCount`
 * bars from `barIndex`: one for a rewritten bar, a run for chord marks.
 */
export function applyTabEdit(
	pattern: FingerpickPattern,
	op: "append" | "replace",
	barIndex: number | null,
	measures: readonly Measure[],
	replaceCount = 1,
): FingerpickPattern {
	if (op === "append") return { ...pattern, measures: [...pattern.measures, ...measures] };
	const at = Math.max(0, Math.min(pattern.measures.length - 1, barIndex ?? 0));
	return {
		...pattern,
		measures: [...pattern.measures.slice(0, at), ...measures, ...pattern.measures.slice(at + replaceCount)],
	};
}
