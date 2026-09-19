import type { ChordIndexEntry } from "@/lib/chordSearch";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import type { NamedPattern } from "@/lib/lastPattern";
import { explainEditIntent } from "@/lib/assistant/strum/editIntent";
import { routeAssistantInput } from "@/lib/assistant/strum/router";
import { findTabPattern, tabEditClause } from "@/lib/assistant/tab/editIntent";
import { routeTabInput } from "@/lib/assistant/tab/router";
import type { AssistantDomain } from "@/lib/assistant/types";

/**
 * The safety net under the mode chip.
 *
 * The player picks which assistant a thread talks to, and the pick is never
 * second-guessed — except when it plainly failed: the chosen readers made
 * nothing of the sentence, and the other assistant's readers make something
 * of it whole. Then, and only then, the reply carries an offer to read it as
 * the other one. The offer costs no model call: it is the other domain's
 * router and edit reader, both rules, run once.
 */

export interface ReadAsInput {
	index: readonly ChordIndexEntry[];
	strumPatterns: readonly NamedPattern[];
	tabPatterns: readonly FingerpickPattern[];
}

/** Whether the other assistant would have read the sentence; the domain it belongs to if so. */
export function otherDomainReads(
	mode: AssistantDomain,
	text: string,
	{ index, strumPatterns, tabPatterns }: ReadAsInput,
): AssistantDomain | null {
	if (text.trim() === "") return null;
	if (mode === "strum") return tabReads(text, index, tabPatterns) ? "tab" : null;
	return strumReads(text, index, strumPatterns) ? "strum" : null;
}

function strumReads(text: string, index: readonly ChordIndexEntry[], patterns: readonly NamedPattern[]): boolean {
	if (routeAssistantInput(text, index).path !== "llm") return true;
	// An edit names its target: "add C G to belief" reads as strum when
	// "belief" is a strum pattern, whatever the chip says.
	return explainEditIntent(text, patterns).matchedName !== null;
}

function tabReads(text: string, index: readonly ChordIndexEntry[], patterns: readonly FingerpickPattern[]): boolean {
	if (routeTabInput(text, index, patterns).path !== "llm") return true;
	const clause = tabEditClause(text);
	return clause !== null && findTabPattern(clause.name, patterns) !== null;
}
