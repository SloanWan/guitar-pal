import type { ChordIndexEntry } from "@/lib/chordSearch";
import { beatTicks, changeTimeSignature, slotDurationUnits } from "@/lib/fingerpickEdit";
import { clampBpmToMeter } from "@/lib/strumBars";
import { setSlotChord } from "@/lib/fingerpickChords";
import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import { beatsPerBar } from "@/lib/strumMeter";
import type { ChordRef } from "@/lib/strumPatterns";
import type { ValidationIssue } from "@/lib/tabImport";
import { buildTabProposal } from "@/lib/assistant/tab/buildTabProposal";
import { readTabSentence } from "@/lib/assistant/tab/readTabSentence";
import { routeTabInput } from "@/lib/assistant/tab/router";
import type { VoicingLookup } from "@/lib/assistant/tab/voicings";

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

export type TabEditOp = "append" | "replace" | "chords" | "rename" | "delete" | "set";

/** One place chords go: a bar or a range, a beat or a slot, and the chord words. */
interface ChordItem {
	/** 1-based, as the player counts bars. */
	bar: number;
	/** The last bar of a range, 1-based, when one was named. */
	barTo: number | null;
	/** 1-based; null means the first beat. */
	beat: number | null;
	/**
	 * 1-based, the slot as the editor numbers them — named instead of a beat
	 * by a player looking at the grid. Outranks `beat` when both are given.
	 */
	slot: number | null;
	spec: string;
}

/** How the target was named, before the library is consulted. */
interface EditClause {
	op: TabEditOp;
	name: string;
	/** 1-based, as the player counts bars; only for a replace. */
	bar: number | null;
	/** Everything after the colon: the bars to write; for a rename the new name; for a set the value. */
	spec: string;
	/** For chord marks: every place named, in the order written. */
	items: ChordItem[];
}

/** "rename my arp to slow arp", "把 my arp 改名为 慢琶音", "重命名 my arp 为 x". */
const RENAME_EN = /^\s*rename\s+(.+?)\s+(?:to|as)\s+(.+?)\s*$/i;
/** "rename my arp" — the verb and the target, and nothing to call it yet. */
const RENAME_EN_BARE = /^\s*rename\s+(.+?)\s*$/i;
const RENAME_ZH = /^\s*(?:把|将)?\s*(.+?)\s*(?:改名为|改名成|改名叫|重命名为|改叫|改名)\s*(.*?)\s*$/;
const RENAME_ZH_LEAD = /^\s*重命名\s*(.+?)\s*(?:为|成|叫)\s*(.+?)\s*$/;
/** "delete my arp", "删掉 my arp", "把 my arp 删了". */
const DELETE_EN = /^\s*(?:delete|remove)\s+(?:the\s+)?(?:pattern\s+)?(.+?)\s*$/i;
const DELETE_ZH_LEAD = /^\s*(?:删除|删掉|删了|移除|去掉)\s*(.+?)\s*$/;
const DELETE_ZH_TAIL = /^\s*(?:把|将)?\s*(.+?)\s*(?:删除|删掉|删了|移除|去掉)\s*$/;
/** "set my arp to 90 bpm", "change my arp to 3/4", "my arp at 90 bpm", "把 my arp 改成 3/4". */
const SET_EN = /^\s*(?:set|change|make|put)\s+(.+?)\s+(?:to|at|in)\s+(.+?)\s*$/i;
const SET_EN_AT = /^\s*(.+?)\s+(?:at|to)\s+(\d{2,3}\s*bpm)\s*$/i;
const SET_ZH = /^\s*(?:把|将)?\s*(.+?)\s*(?:设为|设成|设置为|改成|改为|调到|调成|调为)\s*(.+?)\s*$/;

/** A bar by either name: "bar 2", "measure 2". */
const BAR_EN = String.raw`(?:bars?|measures?)\s+(\d+)(?:\s*(?:[-–]|to)\s*(\d+))?`;
/** Where in the bar: "beat 3" as the player counts, or "slot 3" as the editor numbers the grid. */
const WHERE_EN = String.raw`(?:\s*,?\s*(?:on\s+|at\s+)?(?:beat\s+(\d+)|slots?\s+(\d+)))?`;

/**
 * "in lick, add Cm7 to bar 1, add F7 to bar 2": the target once, then a list.
 * The first item may also carry the target itself — "add Cm7 to bar 1 of
 * lick, add F7 to bar 2" — and the rest follow without it.
 */
const CHORDS_LIST_EN = /^\s*(?:in|on|for)\s+(.+?)\s*[,，:：]\s*((?:add|mark|put|set|write)\s[\s\S]+)$/i;
const CHORD_ITEM_EN = new RegExp(
	String.raw`^\s*(?:(?:add|mark|put|set|write)\s+)?(?:(?:the\s+)?chords?\s+)?(.+?)\s+(?:to|on|at|in|over)\s+${BAR_EN}${WHERE_EN}\s*$`,
	"i",
);
const CHORDS_LIST_ZH_LEAD = /^\s*(?:给|在|把|为)?\s*/;
const CHORD_ITEM_ZH =
	/^\s*第\s*(\d+)\s*(?:[-–到至]\s*(\d+))?\s*小节\s*(?:的?\s*第\s*(\d+)\s*拍)?\s*(?:上|里)?\s*(?:加上|添加|标上|标记|加|标|放|配|用|写)?\s*(?:和弦)?\s*[:：]?\s*(.+)$/;
const LIST_SEPARATOR = /[,，;；\n]+/;

/** "add chord Am to bar 2 beat 3 of lick", "mark C G Am F on bars 1-4 of lick", "add Am to measure 1 slot 3 of lick". */
const CHORDS_VERB_EN = new RegExp(
	String.raw`^\s*(?:add|set|put|write|mark)(?:\s+(?:the\s+)?chords?)?\s+(.+?)\s+(?:to|on|at|in|over)\s+${BAR_EN}${WHERE_EN}\s+(?:of|in|on)\s+([^,，;；\n]+?)\s*$`,
	"i",
);
/** "lick bar 2 beat 3: Am", "chords for lick bars 1-4: C G Am F". */
const CHORDS_COLON_EN = new RegExp(
	String.raw`^\s*(?:(?:set|mark|add|put|write)\s+)?(?:chords?\s+(?:for|on|in|over)\s+)?(.+?)\s+${BAR_EN}${WHERE_EN}\s*[:：]\s*(.+)$`,
	"i",
);
/** "给 lick 第 2 小节第 3 拍加和弦 Am", "lick 第 1-4 小节和弦：C G Am F". */
const CHORDS_ZH =
	/^\s*(?:给|在|把|为)?\s*(.+?)\s*的?\s*第\s*(\d+)\s*(?:[-–到至]\s*(\d+))?\s*小节\s*(?:的?\s*第\s*(\d+)\s*拍)?\s*(?:上|里)?\s*(?:加上|添加|标上|标记|加|标|放|配|用|写)?\s*和弦\s*[:：]?\s*(.+)$/;

const APPEND_EN = /^\s*(?:add|append)\s+(?:(?:a\s+)?(?:bars?|measures?)\s+)?to\s+(.+?)\s*[:：]\s*([\s\S]+)$/i;
const APPEND_ZH = /^\s*(?:给|在|往|向)\s*(.+?)\s*(?:里|中)?\s*(?:加上|添加|追加|加)\s*(?:一?小节|bars?)?\s*[:：]?\s*([\s\S]+)$/;
const REPLACE_EN = /^\s*(?:replace|set|change|rewrite)\s+(?:bar|measure)\s+(\d+)\s+(?:of|in|on)\s+(.+?)\s*(?:[:：]|\bto\b|\bwith\b)\s*([\s\S]+)$/i;
const REPLACE_ZH = /^\s*(?:把|将)?\s*(.+?)\s*的?\s*第\s*(\d+)\s*(?:小节|bar)\s*(?:改成|改为|换成|替换成|替换为|改)\s*[:：]?\s*([\s\S]+)$/;

const num = (raw: string | undefined): number | null => (raw === undefined ? null : Number(raw));

const chords = (name: string, items: ChordItem[]): EditClause => ({ op: "chords", name, bar: null, spec: "", items });
const item = (bar: string, barTo: string | undefined, beat: string | undefined, slot: string | undefined, spec: string): ChordItem => ({
	bar: Number(bar),
	barTo: num(barTo),
	beat: num(beat),
	slot: num(slot),
	spec,
});

/** Whether a fragment can stand as an item of its own: it names a bar. */
const HAS_BAR_EN = /\b(?:bars?|measures?)\s+\d/i;
const HAS_BAR_ZH = /^\s*第\s*\d+/;

/**
 * The fragments of a list, with a chord list's own commas healed: in
 * "add Am7, D7, Gm7 to bar 5-8" the first two fragments name no bar, so they
 * belong to the item that follows; in "第 5 小节 Am7, D7" a fragment that does
 * not begin with a bar belongs to the item before it.
 */
function fragments(list: string, order: "spec-first" | "bar-first"): string[] {
	const parts = list.split(LIST_SEPARATOR).map((p) => p.trim()).filter((p) => p !== "");
	const out: string[] = [];
	if (order === "spec-first") {
		let held = "";
		for (const part of parts) {
			if (HAS_BAR_EN.test(part)) {
				out.push(held ? `${held}, ${part}` : part);
				held = "";
			} else {
				held = held ? `${held}, ${part}` : part;
			}
		}
		if (held) out.push(held);
	} else {
		for (const part of parts) {
			if (HAS_BAR_ZH.test(part) || out.length === 0) out.push(part);
			else out[out.length - 1] = `${out[out.length - 1]}, ${part}`;
		}
	}
	return out;
}

/** Every item of a list, or null if any one of them is not an item. */
function readItems(list: string, matcher: RegExp, order: "spec-first" | "bar-first"): ChordItem[] | null {
	const items: ChordItem[] = [];
	for (const part of fragments(list, order)) {
		const m = matcher.exec(part);
		if (!m) return null;
		items.push(order === "spec-first" ? item(m[2], m[3], m[4], m[5], m[1]) : item(m[1], m[2], m[3], undefined, m[4]));
	}
	return items.length > 0 ? items : null;
}

/**
 * "给 lick 第 1 小节加 Cm7，第 2 小节第 3 拍加 F7": the name is whatever stands
 * before the first "第 N 小节" that begins a readable list — tried at each
 * "第" in turn, since a name may hold one.
 */
function readListZh(text: string): EditClause | null {
	const body = text.replace(CHORDS_LIST_ZH_LEAD, "");
	for (const m of body.matchAll(/第\s*\d+/g)) {
		const name = body.slice(0, m.index).replace(/[\s的,，:：]+$/, "").trim();
		if (name === "") continue;
		const items = readItems(body.slice(m.index), CHORD_ITEM_ZH, "bar-first");
		if (items) return chords(name, items);
	}
	return null;
}

function readClause(text: string): EditClause | null {
	// Chord marks first: they say "chord", "beat", "和弦" or a bar-by-bar list,
	// which no bar spec does.
	let m = CHORDS_LIST_EN.exec(text);
	if (m) {
		const items = readItems(m[2], CHORD_ITEM_EN, "spec-first");
		if (items) return chords(m[1], items);
	}
	m = CHORDS_VERB_EN.exec(text);
	if (m) return chords(m[6], [item(m[2], m[3], m[4], m[5], m[1])]);
	// "add Cm7 to bar 1 of lick, add F7 to bar 2": the target rides on the first
	// item — which may itself hold a comma-separated chord list.
	const [head, ...tail] = fragments(text, "spec-first");
	m = tail.length > 0 ? CHORDS_VERB_EN.exec(head) : null;
	if (m) {
		const rest = readItems(tail.join(", "), CHORD_ITEM_EN, "spec-first");
		if (rest) return chords(m[6], [item(m[2], m[3], m[4], m[5], m[1]), ...rest]);
	}
	// "改成" is a rewrite of the bar, and is read before the chord list that
	// would otherwise take it for a chord on the bar.
	m = REPLACE_ZH.exec(text);
	if (m) return { op: "replace", name: m[1], bar: Number(m[2]), spec: m[3], items: [] };
	m = CHORDS_ZH.exec(text);
	if (m) return chords(m[1], [item(m[2], m[3], m[4], undefined, m[5])]);
	const zhList = readListZh(text);
	if (zhList) return zhList;
	m = CHORDS_COLON_EN.exec(text);
	if (m) return chords(m[1], [item(m[2], m[3], m[4], m[5], m[6])]);
	m = REPLACE_EN.exec(text);
	if (m) return { op: "replace", bar: Number(m[1]), name: m[2], spec: m[3], items: [] };
	m = APPEND_EN.exec(text);
	if (m) return { op: "append", name: m[1], bar: null, spec: m[2], items: [] };
	m = APPEND_ZH.exec(text);
	if (m) return { op: "append", name: m[1], bar: null, spec: m[2], items: [] };
	// The pattern itself: its name, its existence, its tempo or meter.
	m = RENAME_EN.exec(text) ?? RENAME_ZH_LEAD.exec(text) ?? RENAME_ZH.exec(text);
	if (m) return { op: "rename", name: m[1], bar: null, spec: m[2], items: [] };
	m = RENAME_EN_BARE.exec(text);
	if (m) return { op: "rename", name: m[1], bar: null, spec: "", items: [] };
	m = DELETE_EN.exec(text) ?? DELETE_ZH_LEAD.exec(text) ?? DELETE_ZH_TAIL.exec(text);
	if (m) return { op: "delete", name: m[1], bar: null, spec: "", items: [] };
	m = SET_EN.exec(text) ?? SET_ZH.exec(text) ?? SET_EN_AT.exec(text);
	if (m) return { op: "set", name: m[1], bar: null, spec: m[2], items: [] };
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
	/** A new name for one of the player's own; empty when the sentence said to rename but not to what. */
	| { kind: "rename"; pattern: FingerpickPattern; newName: string }
	| { kind: "delete"; pattern: FingerpickPattern }
	/**
	 * A tempo, a meter, or both. `pattern` is the target as it is; `next` is
	 * it as it would be — the meter change refitted by `changeTimeSignature`,
	 * with the bars that lose notes listed so the player is told.
	 */
	| { kind: "set"; pattern: FingerpickPattern; next: FingerpickPattern; bpm: number | null; timeSignature: [number, number] | null; affectedBars: number[] }
	| { kind: "value-unread"; op: "set"; pattern: FingerpickPattern; value: string }
	| { kind: "unknown-pattern"; op: TabEditOp; name: string }
	| { kind: "ambiguous"; op: TabEditOp; name: string; matches: FingerpickPattern[] }
	| { kind: "bar-out-of-range"; op: "replace" | "chords"; pattern: FingerpickPattern; bar: number }
	| { kind: "beat-out-of-range"; op: "chords"; pattern: FingerpickPattern; beat: number }
	| { kind: "slot-out-of-range"; op: "chords"; pattern: FingerpickPattern; bar: number; slot: number; slots: number }
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
	for (const wanted of spellings(name)) {
		const found = patterns.find((p) => p.name.trim().toLowerCase() === wanted);
		if (found) return found;
	}
	return null;
}

/**
 * Every pattern a name could mean when none matches it whole: the ones whose
 * name contains it. "travis" finds "Travis Picking"; "arp" finds both "my arp"
 * and "Arpeggio", which is a question for the player.
 */
export function findTabPatterns(name: string, patterns: readonly FingerpickPattern[]): FingerpickPattern[] {
	const wanted = spellings(name).filter((w) => w.length >= 2);
	return patterns.filter((p) => wanted.some((w) => p.name.trim().toLowerCase().includes(w)));
}

/**
 * The name as written, and without the words around it — "the", "my",
 * "pattern" — tried in that order, so a pattern actually called "my arp"
 * is found before "arp" is looked for inside other names.
 */
function spellings(name: string): string[] {
	const bare = name.trim().replace(/^["'「『《]|["'」』》]$/g, "").trim().toLowerCase();
	const stripped = bare
		.replace(/^(?:the\s+|my\s+)?(?:pattern\s+)?/, "")
		.replace(/\s+pattern$/, "")
		.trim();
	return stripped === bare || stripped === "" ? [bare] : [bare, stripped];
}

/** A written tempo, a meter, or both: "90 bpm", "3/4", "3/4 at 90 bpm", "三拍子". */
function readSetValue(
	value: string,
	index: readonly ChordIndexEntry[],
): { bpm: number | null; timeSignature: [number, number] | null } | null {
	const bare = /^\s*(\d{2,3})\s*$/.exec(value);
	if (bare) return { bpm: Number(bare[1]), timeSignature: null };
	const reading = readTabSentence(value, index);
	if (reading.leftover !== "" || reading.chordWords.length > 0 || reading.order || reading.notes) return null;
	if (reading.bpm === null && reading.timeSignature === null) return null;
	return { bpm: reading.bpm, timeSignature: reading.timeSignature };
}

/** The bars a spec describes, built to the target's meter, one segment at a time. */
export function readTabEdit({ text, index, patterns, voicingFor }: ReadTabEditInput): TabEditReading | null {
	const clause = readClause(text);
	if (!clause) return null;

	let pattern = findTabPattern(clause.name, patterns);
	if (!pattern) {
		const near = findTabPatterns(clause.name, patterns);
		if (near.length > 1) return { kind: "ambiguous", op: clause.op, name: clause.name.trim(), matches: near };
		pattern = near[0] ?? null;
	}
	if (!pattern) return { kind: "unknown-pattern", op: clause.op, name: clause.name.trim() };

	if (clause.op === "rename") return { kind: "rename", pattern, newName: clause.spec.trim().replace(/^["'「『《]|["'」』》]$/g, "") };
	if (clause.op === "delete") return { kind: "delete", pattern };
	if (clause.op === "set") {
		const value = readSetValue(clause.spec, index);
		if (!value) return { kind: "value-unread", op: "set", pattern, value: clause.spec.trim() };
		return applySet(pattern, value.bpm, value.timeSignature);
	}

	if (clause.op === "chords") return readChordMarks(clause.items, pattern, index);
	if (clause.op === "replace" && (clause.bar === null || clause.bar < 1 || clause.bar > pattern.measures.length)) {
		return { kind: "bar-out-of-range", op: "replace", pattern, bar: clause.bar ?? 0 };
	}

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

/**
 * The pattern with a new tempo, meter or both. A meter change goes through
 * the editor's own refit, so what the assistant offers is exactly what the
 * meter dropdown would do — including which bars lose notes.
 */
export function applySet(
	pattern: FingerpickPattern,
	bpm: number | null,
	timeSignature: [number, number] | null,
): Extract<TabEditReading, { kind: "set" }> {
	let next = pattern;
	let affectedBars: number[] = [];
	if (timeSignature && (timeSignature[0] !== pattern.timeSignature[0] || timeSignature[1] !== pattern.timeSignature[1])) {
		const change = changeTimeSignature(pattern, timeSignature);
		next = change.fitted;
		affectedBars = change.affectedMeasures.map((i) => i + 1);
	}
	if (bpm !== null) next = { ...next, bpm: clampBpmToMeter(bpm, next.timeSignature) };
	return { kind: "set", pattern, next, bpm: bpm === null ? null : next.bpm, timeSignature, affectedBars };
}

/** The beat a slot begins in, 1-based — what a slot named by number is said back as. */
export function beatAtSlot(measure: Measure, slotIndex: number, timeSignature: [number, number]): number {
	let at = 0;
	for (let i = 0; i < slotIndex && i < measure.slots.length; i++) at += slotDurationUnits(measure.slots[i].duration);
	return Math.floor(at / beatTicks(timeSignature)) + 1;
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
 * Chord marks over bars. Each item names a bar or a range: one chord is
 * written on every bar in it; several are written one per bar, and then the
 * range has to be as long as the list — or absent, in which case the list
 * sets it. The beat is where in each bar the mark goes, the first beat
 * unless one was named — or a slot, when the player counted the grid's
 * cells instead. Several items make one edit over the bars from the first
 * touched to the last.
 */
function readChordMarks(
	items: readonly ChordItem[],
	pattern: FingerpickPattern,
	index: readonly ChordIndexEntry[],
): TabEditReading {
	const beats = beatsPerBar(pattern.timeSignature);
	const warnings: ValidationIssue[] = [];
	const marks: { bar: number; beat: number; chord: ChordRef }[] = [];
	let next = pattern;
	let low = Number.POSITIVE_INFINITY;
	let high = 0;

	for (const it of items) {
		const reading = readTabSentence(it.spec, index);
		const words = reading.chordWords;
		if (words.length === 0 || reading.leftover !== "") {
			return { kind: "segment-unread", op: "chords", pattern, segment: it.spec.trim() };
		}
		const from = it.bar;
		if (from < 1 || from > pattern.measures.length) return { kind: "bar-out-of-range", op: "chords", pattern, bar: from };
		const beat = it.beat ?? 1;
		if (it.slot === null && (beat < 1 || beat > beats)) return { kind: "beat-out-of-range", op: "chords", pattern, beat };
		if (it.slot !== null) {
			const slots = pattern.measures[from - 1].slots.length;
			if (it.slot < 1 || it.slot > slots) return { kind: "slot-out-of-range", op: "chords", pattern, bar: from, slot: it.slot, slots };
		}
		const to = it.barTo ?? (words.length > 1 ? from + words.length - 1 : from);
		if (to < from || to > pattern.measures.length) return { kind: "bar-out-of-range", op: "chords", pattern, bar: to };
		const count = to - from + 1;
		if (words.length > count) {
			return { kind: "chords-mismatch", op: "chords", pattern, bars: count, chords: words.length };
		}

		for (let i = 0; i < count; i++) {
			const bar = from + i;
			// Fewer chords than bars: one per bar, and the last holds through the
			// rest of the range the way a lead sheet reads — so any mark already
			// on those bars is taken off, or it would cut the chord short.
			if (words.length > 1 && i >= words.length) {
				const measure = next.measures[bar - 1];
				for (let slotIndex = 0; slotIndex < measure.slots.length; slotIndex++) {
					if (measure.slots[slotIndex].chord) next = setSlotChord(next, { measureIndex: bar - 1, slotIndex }, null);
				}
				high = Math.max(high, bar);
				continue;
			}
			const word = words.length === 1 ? words[0] : words[i];
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
			const measure = pattern.measures[measureIndex];
			// A named slot is the player's own count of the grid, and wins over a
			// beat; a bar further along the range may be shorter than the first.
			const slotIndex =
				it.slot !== null
					? Math.min(it.slot - 1, measure.slots.length - 1)
					: slotAtBeat(measure, beat, pattern.timeSignature);
			next = setSlotChord(next, { measureIndex, slotIndex }, word.chord);
			marks.push({ bar, beat: it.slot !== null ? beatAtSlot(measure, slotIndex, pattern.timeSignature) : beat, chord: word.chord });
			low = Math.min(low, bar);
			high = Math.max(high, bar);
		}
	}

	if (marks.length === 0) return { kind: "chords", pattern, barIndex: 0, measures: [], marks, warnings };
	return {
		kind: "chords",
		pattern,
		barIndex: low - 1,
		measures: next.measures.slice(low - 1, high),
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
