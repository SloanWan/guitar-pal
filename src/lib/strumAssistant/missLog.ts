import type { EditIntentExplanation } from "@/lib/strumAssistant/editIntent";

/**
 * A record of the sentences nothing read, and what was picked afterwards.
 *
 * Every miss is a candidate for the eval set and a hint at the next rule: the
 * sentence, what the readers saw in it, what was offered, and — the useful
 * half — which offer the player took, which is the intent the sentence had.
 * Kept in this browser only, bounded, and never sent anywhere; it is read by
 * whoever is extending the rules, from the console.
 */

const KEY = "guitarpal:strumAssistantMisses";
const MAX_ENTRIES = 200;

export interface MissEntry {
	at: string;
	input: string;
	/** What the edit reader saw — enough to write the case that would catch it. */
	seen: Pick<EditIntentExplanation, "op" | "verb" | "matchedName" | "guessedName" | "chordWords">;
	offered: string[];
	/** The sentence taken into the composer, once one is. */
	picked?: string;
}

export function readMisses(): MissEntry[] {
	try {
		const raw = localStorage.getItem(KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? (parsed as MissEntry[]) : [];
	} catch {
		return [];
	}
}

function write(entries: MissEntry[]): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
	} catch {
		// Private mode or a full quota: the record is a convenience, not a duty.
	}
}

export function recordMiss(input: string, seen: EditIntentExplanation, offered: string[]): void {
	const entry: MissEntry = {
		at: new Date().toISOString(),
		input,
		seen: {
			op: seen.op,
			verb: seen.verb,
			matchedName: seen.matchedName,
			guessedName: seen.guessedName,
			chordWords: seen.chordWords,
		},
		offered,
	};
	write([...readMisses(), entry]);
	if (process.env.NODE_ENV === "development") {
		console.info(`[assistant] no rule read "${input}"`, entry.seen, "offered:", offered);
	}
}

/** The most recent miss for this sentence takes the pick; there is only ever one open. */
export function recordPick(input: string, picked: string): void {
	const entries = readMisses();
	for (let i = entries.length - 1; i >= 0; i--) {
		if (entries[i].input === input && entries[i].picked === undefined) {
			entries[i] = { ...entries[i], picked };
			write(entries);
			return;
		}
	}
}

/** Everything recorded, as JSON — for pasting into the eval set. */
export function exportMisses(): string {
	return JSON.stringify(readMisses(), null, "\t");
}
