import type { Bar, ChordRef } from "@/lib/strumPatterns";
import { validateBars } from "@/lib/strumBars";
import type { AssistantProposal } from "@/lib/strumAssistant/types";

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

export interface AssistantHandoff {
	name: string;
	bars: Bar[];
	bpm: number | null;
	chords: ChordRef[];
}

export function stashHandoff(proposal: AssistantProposal): void {
	const handoff: AssistantHandoff = {
		name: proposal.name,
		bars: proposal.bars,
		bpm: proposal.bpm,
		chords: proposal.chords,
	};
	try {
		sessionStorage.setItem(KEY, JSON.stringify(handoff));
	} catch {
		// Private mode or a full quota: the navigation still happens, the page
		// just opens without a pattern waiting.
	}
}

/**
 * Reads and clears the pending handoff. Validated rather than trusted:
 * sessionStorage is writable by anything running on the origin, so this is an
 * untrusted input like any other.
 */
export function takeHandoff(): AssistantHandoff | null {
	let raw: string | null = null;
	try {
		raw = sessionStorage.getItem(KEY);
		sessionStorage.removeItem(KEY);
	} catch {
		return null;
	}
	if (raw === null) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null) return null;

	const value = parsed as Record<string, unknown>;
	// validateBars was written for exactly this: checking bars that came from
	// outside the app before anything downstream trusts their shape.
	if (!validateBars(value.bars).ok) return null;
	if (typeof value.name !== "string" || value.name.trim() === "") return null;
	if (value.bpm !== null && typeof value.bpm !== "number") return null;
	if (!Array.isArray(value.chords)) return null;

	return {
		name: value.name,
		bars: value.bars as Bar[],
		bpm: value.bpm as number | null,
		chords: value.chords as ChordRef[],
	};
}
