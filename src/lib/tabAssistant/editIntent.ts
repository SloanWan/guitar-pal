import type { ChordIndexEntry } from "@/lib/chordSearch";
import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import type { ValidationIssue } from "@/lib/tabImport";
import { buildTabProposal } from "@/lib/tabAssistant/buildTabProposal";
import { routeTabInput } from "@/lib/tabAssistant/router";
import type { VoicingLookup } from "@/lib/tabAssistant/voicings";

/**
 * Reading a request to change a pattern the player already has, bar by bar.
 *
 *     add to travis: string:6654, fret:8-11-10-8; Am: 5 3 2 1
 *     replace bar 2 of travis: C: 5/4 2 1 3
 *     给 travis 加：string:6654, fret:8-11-10-8
 *     把 travis 的第 2 小节改成 Am: 5 3 2 1
 *
 * A verb, a name the library carries, and after the colon the bars — each
 * one written the way a new pattern is written, so nothing here is a new
 * grammar: every segment goes through the same readers, built to the
 * target's meter, and the result is put in front of the player before a
 * row is touched. Presets cannot be edited; a change to one becomes a copy.
 */

export type TabEditOp = "append" | "replace";

/** How the target was named, before the library is consulted. */
interface EditClause {
	op: TabEditOp;
	name: string;
	/** 1-based, as the player counts bars; only for a replace. */
	bar: number | null;
	/** Everything after the colon: the bars to write. */
	spec: string;
}

const APPEND_EN = /^\s*(?:add|append)\s+(?:(?:a\s+)?bars?\s+)?to\s+(.+?)\s*[:：]\s*([\s\S]+)$/i;
const APPEND_ZH = /^\s*(?:给|在|往|向)\s*(.+?)\s*(?:里|中)?\s*(?:加上|添加|追加|加)\s*(?:一?小节|bars?)?\s*[:：]?\s*([\s\S]+)$/;
const REPLACE_EN = /^\s*(?:replace|set|change|rewrite)\s+bar\s+(\d+)\s+(?:of|in|on)\s+(.+?)\s*(?:[:：]|\bto\b|\bwith\b)\s*([\s\S]+)$/i;
const REPLACE_ZH = /^\s*(?:把|将)?\s*(.+?)\s*的?\s*第\s*(\d+)\s*(?:小节|bar)\s*(?:改成|改为|换成|替换成|替换为|改)\s*[:：]?\s*([\s\S]+)$/;

function readClause(text: string): EditClause | null {
	let m = REPLACE_EN.exec(text);
	if (m) return { op: "replace", bar: Number(m[1]), name: m[2], spec: m[3] };
	m = REPLACE_ZH.exec(text);
	if (m) return { op: "replace", name: m[1], bar: Number(m[2]), spec: m[3] };
	m = APPEND_EN.exec(text);
	if (m) return { op: "append", name: m[1], bar: null, spec: m[2] };
	m = APPEND_ZH.exec(text);
	if (m) return { op: "append", name: m[1], bar: null, spec: m[2] };
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
	| { kind: "unknown-pattern"; op: TabEditOp; name: string }
	| { kind: "bar-out-of-range"; op: "replace"; pattern: FingerpickPattern; bar: number }
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

/** The pattern as it would be after the edit — what the page writes, and what the card can show. */
export function applyTabEdit(
	pattern: FingerpickPattern,
	op: TabEditOp,
	barIndex: number | null,
	measures: readonly Measure[],
): FingerpickPattern {
	if (op === "append") return { ...pattern, measures: [...pattern.measures, ...measures] };
	const at = Math.max(0, Math.min(pattern.measures.length - 1, barIndex ?? 0));
	return {
		...pattern,
		measures: [...pattern.measures.slice(0, at), ...measures, ...pattern.measures.slice(at + 1)],
	};
}
