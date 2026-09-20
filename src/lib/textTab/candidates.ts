import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import type { Meter } from "@/lib/strumMeter";
import { normalizeImportedPattern, type ValidationIssue } from "@/lib/tabImport";
import { readTextTab } from "@/lib/textTab/columns";
import { textTabReadings, type TextTabReadingId } from "@/lib/textTab/readings";

/**
 * A text tab as the patterns the player can listen to and pick from (#228):
 * every reading of its columns, validated into the editor's own shape. The
 * one the player takes goes to the fingerpick page through the ordinary
 * handoff, with `byEarWarning` on it — the rhythm was chosen, not read.
 */

export interface TextTabCandidate {
	id: TextTabReadingId;
	label: string;
	description: string;
	pattern: FingerpickPattern;
	/** What the reading guessed or dropped, plus what the validator repaired. */
	warnings: ValidationIssue[];
}

export interface TextTabOptions {
	timeSignature?: Meter;
	bpm?: number | null;
	name?: string;
}

export type TextTabCandidates =
	| { ok: true; candidates: TextTabCandidate[] }
	| { ok: false; error: string };

export const DEFAULT_CANDIDATE_NAME = "Text tab";

export function textTabCandidates(text: string, options: TextTabOptions = {}): TextTabCandidates {
	const columns = readTextTab(text);
	if (columns === null) return { ok: false, error: "Six lines of tab are needed, one per string." };
	if (columns.bars.length === 0) return { ok: false, error: "The tab has no bars in it." };
	const timeSignature = options.timeSignature ?? [4, 4];
	const name = options.name?.trim() || DEFAULT_CANDIDATE_NAME;
	const candidates: TextTabCandidate[] = [];
	for (const reading of textTabReadings(columns, timeSignature)) {
		const { pattern, warnings } = normalizeImportedPattern(reading.draft);
		// A reading the validator refuses outright is a bug in the reading, not
		// a choice for the player; the others still stand.
		if (pattern === null) continue;
		candidates.push({
			id: reading.id,
			label: reading.label,
			description: reading.description,
			pattern: { ...pattern, name, bpm: options.bpm ?? pattern.bpm },
			warnings: [...reading.warnings, ...warnings],
		});
	}
	if (candidates.length === 0) return { ok: false, error: "The tab could not be read into a pattern." };
	return { ok: true, candidates };
}

/** The warning the chosen candidate carries into the editor: the honesty rule (#114) for a rhythm nobody read. */
export function byEarWarning(candidate: TextTabCandidate): ValidationIssue {
	return {
		code: "RHYTHM_BY_EAR",
		path: "measures",
		message: `The rhythm (${candidate.label.toLowerCase()}) was chosen by ear, not read from the source — the text carried none.`,
	};
}
