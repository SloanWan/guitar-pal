import type { ChordIndexEntry } from "@/lib/chordSearch";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import type { ImportedTabDraft, ValidationIssue } from "@/lib/tabImport";
import { asciiTabProse, looksLikeAsciiTab, parseAsciiTab } from "@/lib/tabAssistant/parseAsciiTab";
import { readTabSentence, type TabSentenceReading } from "@/lib/tabAssistant/readTabSentence";
import { stylePreset } from "@/lib/tabAssistant/styles";

/**
 * Decides, without any model call, whether what was typed already says a
 * whole fingerpicking pattern.
 *
 * The tab counterpart of `routeAssistantInput`, on the same load-bearing
 * choice: the model is reached only when the rules run out. Three things are
 * read whole here — a pasted tab, a chord with a pick order, a chord with a
 * style word — and a bare chord line is read too, with the order left to a
 * default that the proposal says is a guess.
 */

export type TabRoute =
	/** Six lines of tab, read as an import. Whatever prose sat around them may name the tempo, meter or name. */
	| {
			path: "ascii";
			draft: ImportedTabDraft;
			warnings: ValidationIssue[];
			name: string | null;
			bpm: number | null;
	  }
	/** `string:66544322, fret:8-11-10-8-10-8-8-11` — notes written out, no chord needed. */
	| { path: "notes"; reading: TabSentenceReading }
	/** `Am: 5 3 2 1 3 2 1 3` — chords and the order to pick them in. */
	| { path: "pick-order"; reading: TabSentenceReading }
	/** `travis picking in Am` — chords and a shipped pattern's order. */
	| { path: "style"; reading: TabSentenceReading; preset: FingerpickPattern }
	/** `C G Am F` — chords alone; the order will be a default. */
	| { path: "chords"; reading: TabSentenceReading }
	| { path: "llm"; reason: TabLlmReason };

export type TabLlmReason =
	| "empty"
	| "unread"
	| "nothing-musical"
	| "style-unavailable"
	| "tab-unreadable"
	/** String and fret lists were there but did not pair up; the reading says why. */
	| "notes-mismatch";

export function routeTabInput(
	input: string,
	index: readonly ChordIndexEntry[],
	presets: readonly FingerpickPattern[] = PRESET_FINGERPICK_PATTERNS,
): TabRoute {
	if (input.trim() === "") return { path: "llm", reason: "empty" };

	if (looksLikeAsciiTab(input)) {
		// The lines around the tab are read for what they can carry — a meter,
		// a tempo, a name — and nothing else is asked of them: a paste often
		// comes with a title, and a title is not a request.
		const prose = readTabSentence(asciiTabProse(input), index);
		const parsed = parseAsciiTab(input, {
			...(prose.timeSignature ? { timeSignature: prose.timeSignature } : {}),
		});
		if (!parsed.ok) return { path: "llm", reason: "tab-unreadable" };
		return { path: "ascii", draft: parsed.draft, warnings: parsed.warnings, name: prose.name, bpm: prose.bpm };
	}

	const reading = readTabSentence(input, index);
	if (reading.notesError !== null) return { path: "llm", reason: "notes-mismatch" };
	if (reading.leftover !== "") return { path: "llm", reason: "unread" };

	if (reading.notes) return { path: "notes", reading };
	if (reading.order) return { path: "pick-order", reading };
	if (reading.style) {
		const preset = stylePreset(reading.style, presets);
		if (!preset) return { path: "llm", reason: "style-unavailable" };
		return { path: "style", reading, preset };
	}
	if (reading.chordWords.length > 0) return { path: "chords", reading };
	return { path: "llm", reason: "nothing-musical" };
}
