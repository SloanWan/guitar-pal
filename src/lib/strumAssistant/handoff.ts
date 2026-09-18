import type { Bar, ChordRef } from "@/lib/strumPatterns";
import { validateBars } from "@/lib/strumBars";
import type { AssistantProposal } from "@/lib/strumAssistant/types";
import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import { validateFingerpickPattern, type ValidationIssue } from "@/lib/tabImport";

/**
 * How a confirmed proposal reaches the strum page.
 *
 * The assistant deliberately owns no write path of its own. A pattern and a
 * progression are written to two different tables by hooks the strum page owns,
 * and a second copy of that logic living in a chat panel would be a second thing
 * to keep correct. So the panel hands the proposal over and the page saves it
 * exactly the way the editor does.
 */

const KEY = "guitarpal:strumAssistantHandoff";

/**
 * Announces a stashed proposal to a strum page that is already on screen.
 *
 * The assistant lives in the topbar, so "open in strum" is often pressed from
 * the strum page itself — where navigating to the route it is already on does
 * nothing, and the page's mount-time read has long since run. The stash says so
 * out loud instead, and the page takes it where it stands.
 */
export const HANDOFF_EVENT = "guitarpal:strum-handoff";

/** A pattern the assistant made: saved as a pattern, plus a progression if it carries chords. */
export interface PatternHandoff {
	kind: "pattern";
	name: string;
	bars: Bar[];
	bpm: number | null;
	chords: ChordRef[];
	/** For the progression the chords become; null when none was named. */
	capo: number | null;
}

/** Chords for a pattern that already exists: one new progression on it. */
export interface AttachHandoff {
	kind: "attach";
	patternId: string;
	/** For the message shown if the pattern has since been deleted. */
	patternName: string;
	bars: Bar[];
	capo: number | null;
}

/** A pattern of the player's own, given a new name. */
export interface RenameHandoff {
	kind: "rename";
	patternId: string;
	patternName: string;
	newName: string;
}

/** A pattern of the player's own, removed — with every progression over it. */
export interface DeleteHandoff {
	kind: "delete";
	patternId: string;
	patternName: string;
}

/**
 * A tab the assistant made, for the fingerpick page to open in its editor.
 *
 * Not saved on arrival: a tab is frets on six strings and a rhythm, which the
 * player reads in the editor rather than at a glance, so the page opens it
 * there as a new pattern and the player saves it the way a hand-drawn one is
 * saved. `warnings` is what the reader could not carry over (an unsupported
 * technique, a truncated measure) and is shown above the editor.
 */
export interface FingerpickHandoff {
	kind: "fingerpick";
	pattern: FingerpickPattern;
	warnings: ValidationIssue[];
}

/**
 * Bars for a fingerpick pattern the player already has: added to its end,
 * or in place of one of its bars. The page applies it through the save path
 * the editor uses; a preset is not changed but copied, bars and all.
 */
export interface FingerpickEditHandoff {
	kind: "fingerpick-edit";
	op: "append" | "replace";
	patternId: string;
	/** For the message shown if the pattern has since been deleted. */
	patternName: string;
	/** 0-based; null for an append. */
	barIndex: number | null;
	/** How many bars from `barIndex` the measures stand in for: one rewritten bar, or a run marked with chords. */
	replaceCount: number;
	measures: Measure[];
}

export type StrumHandoff = PatternHandoff | AttachHandoff | RenameHandoff | DeleteHandoff;

export type AssistantHandoff = StrumHandoff | FingerpickHandoff | FingerpickEditHandoff;

/** Which page a handoff is for. The stash holds one at a time, of either. */
export type HandoffDomain = "strum" | "fingerpick";

function domainOf(kind: unknown): HandoffDomain {
	return kind === "fingerpick" || kind === "fingerpick-edit" ? "fingerpick" : "strum";
}

export function patternHandoff(proposal: AssistantProposal): PatternHandoff {
	return {
		kind: "pattern",
		name: proposal.name,
		bars: proposal.bars,
		bpm: proposal.bpm,
		chords: proposal.chords,
		capo: proposal.capo,
	};
}

export function stashHandoff(handoff: AssistantHandoff): void {
	try {
		sessionStorage.setItem(KEY, JSON.stringify(handoff));
	} catch {
		// Private mode or a full quota: the navigation still happens, the page
		// just opens without a pattern waiting.
		return;
	}
	window.dispatchEvent(new CustomEvent(HANDOFF_EVENT));
}

/**
 * Reads and clears the pending handoff for one page. Validated rather than
 * trusted: sessionStorage is writable by anything running on the origin, so
 * this is an untrusted input like any other.
 *
 * Both pages listen for the announcement, and a fingerpick tab confirmed with
 * the strum page on screen would otherwise be taken — and cleared — by the
 * wrong one before the fingerpick page has mounted. So a page names its
 * domain, and a handoff for the other domain is left in the stash untouched.
 */
export function takeHandoff(domain: "fingerpick"): FingerpickHandoff | FingerpickEditHandoff | null;
export function takeHandoff(domain?: "strum"): StrumHandoff | null;
export function takeHandoff(domain: HandoffDomain = "strum"): AssistantHandoff | null {
	let raw: string | null = null;
	try {
		raw = sessionStorage.getItem(KEY);
	} catch {
		return null;
	}
	if (raw === null) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		parsed = null;
	}
	const value =
		typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;

	// Someone else's: leave it for them. Anything unreadable is cleared along
	// with our own, so a broken stash cannot sit there forever.
	if (value !== null && domainOf(value.kind) !== domain) return null;
	try {
		sessionStorage.removeItem(KEY);
	} catch {
		return null;
	}
	if (value === null) return null;

	if (value.kind === "fingerpick") return takeFingerpickHandoff(value);
	if (value.kind === "fingerpick-edit") return takeFingerpickEditHandoff(value);

	if (value.kind === "rename" || value.kind === "delete") {
		if (typeof value.patternId !== "string" || value.patternId === "") return null;
		if (typeof value.patternName !== "string") return null;
		if (value.kind === "delete") {
			return { kind: "delete", patternId: value.patternId, patternName: value.patternName };
		}
		if (typeof value.newName !== "string" || value.newName.trim() === "") return null;
		return {
			kind: "rename",
			patternId: value.patternId,
			patternName: value.patternName,
			newName: value.newName.trim(),
		};
	}

	// validateBars was written for exactly this: checking bars that came from
	// outside the app before anything downstream trusts their shape.
	if (!validateBars(value.bars).ok) return null;

	// A capo read back from storage: a fret, or nothing.
	const capo = typeof value.capo === "number" && Number.isFinite(value.capo) ? value.capo : null;

	if (value.kind === "attach") {
		if (typeof value.patternId !== "string" || value.patternId === "") return null;
		if (typeof value.patternName !== "string") return null;
		return {
			kind: "attach",
			patternId: value.patternId,
			patternName: value.patternName,
			bars: value.bars as Bar[],
			capo,
		};
	}

	if (typeof value.name !== "string" || value.name.trim() === "") return null;
	if (value.bpm !== null && typeof value.bpm !== "number") return null;
	if (!Array.isArray(value.chords)) return null;

	return {
		// Anything stashed before the shape grew a kind is a pattern.
		kind: "pattern",
		name: value.name,
		bars: value.bars as Bar[],
		bpm: value.bpm as number | null,
		chords: value.chords as ChordRef[],
		capo,
	};
}

/**
 * The fingerpick branch of `takeHandoff`. The pattern is run through the same
 * validator a pasted or scanned tab goes through, so a stash that was edited
 * by hand, or written by an older build, comes back repaired or not at all.
 * Warnings stashed alongside it are kept only when they still look like
 * warnings; the validator's own are appended to them.
 */
function takeFingerpickHandoff(value: Record<string, unknown>): FingerpickHandoff | null {
	const { pattern, warnings } = validateFingerpickPattern(value.pattern);
	if (pattern === null) return null;
	const stashed = Array.isArray(value.warnings) ? value.warnings.filter(isValidationIssue) : [];
	return { kind: "fingerpick", pattern, warnings: [...stashed, ...warnings] };
}

function isValidationIssue(value: unknown): value is ValidationIssue {
	if (typeof value !== "object" || value === null) return false;
	const issue = value as Record<string, unknown>;
	return (
		typeof issue.code === "string" &&
		typeof issue.path === "string" &&
		typeof issue.message === "string"
	);
}

/**
 * The bars of an edit are validated as a pattern would be — wrapped in one,
 * since that is the shape the validator reads — and unwrapped again.
 */
function takeFingerpickEditHandoff(value: Record<string, unknown>): FingerpickEditHandoff | null {
	if (value.op !== "append" && value.op !== "replace") return null;
	if (typeof value.patternId !== "string" || value.patternId === "") return null;
	if (typeof value.patternName !== "string") return null;
	const barIndex =
		typeof value.barIndex === "number" && Number.isInteger(value.barIndex) && value.barIndex >= 0
			? value.barIndex
			: null;
	if (value.op === "replace" && barIndex === null) return null;
	const replaceCount =
		typeof value.replaceCount === "number" && Number.isInteger(value.replaceCount) && value.replaceCount >= 1
			? value.replaceCount
			: 1;
	const { pattern } = validateFingerpickPattern({ measures: value.measures, timeSignature: [4, 4], bpm: 100 });
	if (pattern === null) return null;
	return {
		kind: "fingerpick-edit",
		op: value.op,
		patternId: value.patternId,
		patternName: value.patternName,
		barIndex: value.op === "append" ? null : barIndex,
		replaceCount: value.op === "append" ? 0 : replaceCount,
		measures: pattern.measures,
	};
}
