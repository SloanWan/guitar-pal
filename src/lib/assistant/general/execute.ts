import type { ChordIndexEntry } from "@/lib/chordSearch";
import { isSupportedMeter } from "@/lib/strumMeter";
import { chordAbbreviation } from "@/lib/strumProgressions";
import { normalizeImportedPattern } from "@/lib/tabImport/normalizeImportedPattern";
import { buildProposal } from "@/lib/assistant/strum/buildProposal";
import type { EditIntentReading } from "@/lib/assistant/strum/editIntent";
import type { AssistantTurnOutcome } from "@/lib/assistant/strum/turn";
import { ASCII_RHYTHM_GUESSED, legalBarWidths, parseAsciiTab } from "@/lib/assistant/tab/parseAsciiTab";
import type { TabTurnOutcome } from "@/lib/assistant/tab/turn";
import type { TabProposal } from "@/lib/assistant/tab/types";
import type { ProposeStrumInput, ProposeTabInput, ReadInput, ShowChordInput, ToolName } from "@/lib/assistant/general/tools";
import type { AssistantProposal } from "@/lib/assistant/types";
import type { ChordRef } from "@/lib/strumPatterns";
import { exactChord } from "@/lib/assistant/chordAsk";
import { searchChords } from "@/lib/chordSearch";

/**
 * What a tool call comes to, on the client: a line for the model and,
 * when the tool made something, the card the panel shows. The card is the
 * reader's — the model only ever sees the line.
 */

export type ToolCard =
	| { domain: "strum"; proposal: AssistantProposal }
	| { domain: "strum"; edit: EditIntentReading }
	| { domain: "tab"; tabProposal: TabProposal }
	| { domain: "tab"; tabEdit: NonNullable<TabTurnOutcome["edit"]> }
	/** Chord shapes — no page's own, the same card on either. */
	| { domain: "chord"; chords: ChordRef[] };

export interface ToolExecution {
	/** What the model is told. Short: the model narrates, it does not inspect. */
	result: string;
	/** `true` sends the result back as a tool error — a draft to fix, or a reader that read nothing. */
	isError: boolean;
	card?: ToolCard;
	/** The reader's own sentence, for a reply the model leaves blank. */
	text?: string;
}

/** A well-formed input for the tool, or why the call cannot run. */
export function readInput(name: ToolName, input: unknown): { ok: true; input: ReadInput | ProposeStrumInput | ProposeTabInput | ShowChordInput } | { ok: false; error: string } {
	if (typeof input !== "object" || input === null) return { ok: false, error: "input must be an object." };
	const v = input as Record<string, unknown>;
	switch (name) {
		case "read_strum":
		case "read_tab":
		case "edit_strum":
		case "edit_tab":
			return typeof v.text === "string" && v.text.trim() !== ""
				? { ok: true, input: { text: v.text } }
				: { ok: false, error: "text must be a non-empty string." };
		case "propose_strum":
			return typeof v.name === "string" &&
				typeof v.rhythm === "string" &&
				Array.isArray(v.chords) &&
				v.chords.every((c) => typeof c === "string") &&
				typeof v.bpm === "number"
				? { ok: true, input: { name: v.name, rhythm: v.rhythm, chords: v.chords as string[], bpm: v.bpm } }
				: { ok: false, error: "expected name, rhythm, chords[] and bpm." };
		case "propose_tab":
			return typeof v.name === "string" && typeof v.tab === "string" && typeof v.bpm === "number" && typeof v.timeSignature === "string"
				? { ok: true, input: { name: v.name, tab: v.tab, bpm: v.bpm, timeSignature: v.timeSignature } }
				: { ok: false, error: "expected name, tab, bpm and timeSignature." };
		case "show_chord":
			return Array.isArray(v.chords) && v.chords.length > 0 && v.chords.every((c) => typeof c === "string" && c.trim() !== "")
				? { ok: true, input: { chords: v.chords as string[] } }
				: { ok: false, error: "chords must be a non-empty array of chord words." };
	}
}

/** A chord-ask the reader answered, as a line for the model. */
function chordCard(chords: ChordRef[], text: string): ToolExecution {
	return {
		result: `The sentence asks how ${chords.map(chordAbbreviation).join(", ")} ${chords.length === 1 ? "is" : "are"} played. The shapes are shown to the player as a card.`,
		isError: false,
		card: { domain: "chord", chords },
		text,
	};
}

/** The strum reader's outcome, as a line for the model. */
export function strumReadResult(outcome: AssistantTurnOutcome): ToolExecution {
	if (outcome.chords) return chordCard(outcome.chords, outcome.text);
	if (outcome.proposal) {
		const p = outcome.proposal;
		const chords = p.chords.length > 0 ? `chords ${p.chords.map(chordAbbreviation).join(" ")}` : "no chords";
		const notes = [
			p.warnings.rhythmGuessed ? "rhythm was a default, not the player's" : null,
			p.warnings.unresolvedChords.length > 0 ? `unmatched chord words: ${p.warnings.unresolvedChords.join(", ")}` : null,
			p.capo !== null ? `capo ${p.capo}` : null,
		].filter((n): n is string => n !== null);
		return {
			result: `Read a ${p.kind} "${p.name}": ${p.bars.length} bar(s), ${chords}${p.bpm ? `, ${p.bpm} bpm` : ""}${notes.length ? ` (${notes.join("; ")})` : ""}. Shown to the player as a card.`,
			isError: false,
			card: { domain: "strum", proposal: p },
			text: outcome.text,
		};
	}
	if (outcome.edit) {
		const e = outcome.edit;
		const line =
			e.kind === "unknown-pattern"
				? `Read an edit (${e.op}) aimed at "${e.name}", but the player has no strumming pattern by that name.`
				: e.kind === "ambiguous"
					? `Read an edit (${e.op}) aimed at "${e.name}", which matches ${e.matches.length} patterns; the card asks which.`
					: `Read an edit: ${e.op} on "${e.pattern.name}". Shown to the player as a card to confirm.`;
		return { result: line, isError: e.kind === "unknown-pattern", card: { domain: "strum", edit: e }, text: outcome.text };
	}
	return { result: `The strumming reader made nothing of it. It said: ${outcome.text}`, isError: true, text: outcome.text };
}

/** The tab reader's outcome, as a line for the model. */
export function tabReadResult(outcome: TabTurnOutcome): ToolExecution {
	if (outcome.chords) return chordCard(outcome.chords, outcome.text);
	if (outcome.proposal) {
		const p = outcome.proposal;
		return {
			result: `Read a fingerpicking pattern "${p.name}": ${p.pattern.measures.length} bar(s), ${p.pattern.timeSignature.join("/")}${p.bpm ? `, ${p.bpm} bpm` : ""}${p.chords.length ? `, chords ${p.chords.map(chordAbbreviation).join(" ")}` : ""}${p.warnings.length ? ` (${p.warnings.length} warning(s))` : ""}. Shown to the player as a card.`,
			isError: false,
			card: { domain: "tab", tabProposal: p },
			text: outcome.text,
		};
	}
	if (outcome.edit) {
		const e = outcome.edit;
		return {
			result: `Read an edit: ${e.kind} on "${e.pattern.name}". Shown to the player as a card to confirm.`,
			isError: false,
			card: { domain: "tab", tabEdit: e },
			text: outcome.text,
		};
	}
	return { result: `The fingerpicking reader made nothing of it. It said: ${outcome.text}`, isError: true, text: outcome.text };
}

/** The model's strum draft, validated and expanded by the same builder the readers use. */
export function proposeStrum(input: ProposeStrumInput, index: readonly ChordIndexEntry[]): ToolExecution {
	const rhythm = input.rhythm.trim();
	if (rhythm === "" && input.chords.length === 0) {
		return { result: "The draft has neither a rhythm nor chords.", isError: true };
	}
	const built = buildProposal({
		rhythm: rhythm === "" ? null : rhythm,
		chordWords: input.chords,
		index,
		name: input.name.trim() || null,
		bpm: input.bpm > 0 ? input.bpm : null,
		// The model's rhythm is a choice by definition: the player described,
		// and a written rhythm would have gone to the reader.
		rhythmGuessed: true,
	});
	if (!built.ok) {
		return {
			result: `The rhythm "${input.rhythm}" is not valid notation: ${built.errors.map((e) => e.message).join(" ")}`,
			isError: true,
		};
	}
	const p = built.proposal;
	const unmatched = p.warnings.unresolvedChords;
	return {
		result: `Made "${p.name}": ${p.bars.length} bar(s)${unmatched.length ? `; these chord words matched nothing and were left off: ${unmatched.join(", ")}` : ""}. Shown to the player as a card.`,
		isError: false,
		card: { domain: "strum", proposal: p },
	};
}

/** The model's tab draft, read by the same parser a pasted tab goes through. */
export function proposeTab(input: ProposeTabInput): ToolExecution {
	let timeSignature: [number, number] | undefined;
	const meter = input.timeSignature.trim();
	if (meter !== "") {
		const m = /^(\d+)\s*\/\s*(\d+)$/.exec(meter);
		const parsed: [number, number] | null = m ? [Number(m[1]), Number(m[2])] : null;
		if (!parsed || !isSupportedMeter(parsed)) {
			return { result: `"${input.timeSignature}" is not a meter this app supports. Use 4/4, 3/4 or 6/8.`, isError: true };
		}
		timeSignature = parsed;
	}
	const parsed = parseAsciiTab(input.tab, timeSignature ? { timeSignature } : {});
	if (!parsed.ok) return { result: `The tab could not be read: ${parsed.error}`, isError: true };
	// A bar the parser had to round, or had to trim, is an error here though it
	// is only a warning for a tab a player pasted. A paste carries no rhythm but
	// its spacing, so guessing is the best there is; a draft the model wrote can
	// be written again at a width that divides the bar, and the loop allows it
	// one repair. Without this the model is told the card succeeded and dutifully
	// reports the warnings to the player instead of fixing them.
	const guessed = parsed.warnings.filter((w) =>
		(ASCII_RHYTHM_GUESSED as readonly string[]).includes(w.code),
	);
	if (guessed.length > 0) {
		const widths = legalBarWidths(timeSignature ?? [4, 4]).filter((w) => w >= 4);
		const meter = (timeSignature ?? [4, 4]).join("/");
		const legal = widths.length > 1 ? `${widths.slice(0, -1).join(", ")} or ${widths[widths.length - 1]}` : String(widths[0]);
		return {
			result: `${guessed.map((w) => w.message).join(" ")} One column is one time slot, so in ${meter} a bar has to be ${legal} columns wide. Write every bar at one of those widths, the same on all six lines.`,
			isError: true,
		};
	}
	const { pattern, errors, warnings } = normalizeImportedPattern(parsed.draft);
	if (!pattern) {
		return { result: `The tab did not validate: ${errors.map((e) => e.message).join(" ")}`, isError: true };
	}
	const bpm = input.bpm > 0 ? input.bpm : null;
	const named = { ...pattern, name: input.name.trim() || pattern.name, bpm: bpm ?? pattern.bpm };
	const all = [...parsed.warnings, ...warnings];
	return {
		result: `Made "${named.name}": ${named.measures.length} bar(s), ${named.timeSignature.join("/")}${all.length ? ` (${all.length} warning(s): ${all.map((w) => w.message).join("; ")})` : ""}. Shown to the player as a card.`,
		isError: false,
		card: { domain: "tab", tabProposal: { name: named.name, pattern: named, bpm, chords: [], warnings: all } },
	};
}

/**
 * The chords the model named, as a card of their shapes. Exact first — the
 * word as the player wrote it — then the picker's ranked search, since the
 * model may have already tidied "f sharp minor" into "F#m"; a word that
 * still matches nothing is an error for the model to say so about, and no
 * card is made around it.
 */
export function showChord(input: ShowChordInput, index: readonly ChordIndexEntry[]): ToolExecution {
	const chords: ChordRef[] = [];
	const unknown: string[] = [];
	for (const raw of input.chords) {
		const word = raw.trim();
		const chord: ChordRef | null =
			exactChord(word, index) ??
			(() => {
				const hit = searchChords(index, word, 1)[0];
				return hit ? { root: hit.root, suffix: hit.suffix, voicingId: null } : null;
			})();
		if (chord) chords.push(chord);
		else unknown.push(word);
	}
	if (unknown.length > 0) return { result: `The library has no chord called ${unknown.map((w) => `"${w}"`).join(", ")}.`, isError: true };
	const labels = chords.map(chordAbbreviation).join(", ");
	return {
		result: `Found ${labels}. The shapes are shown to the player as a card, with a link to ${chords.length === 1 ? "its page" : "each page and to the grid of all of them"}.`,
		isError: false,
		card: { domain: "chord", chords },
	};
}
