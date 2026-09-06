import type { ChordIndexEntry } from "@/lib/chordSearch";
import type { Bar, Beat, StrumPattern } from "@/lib/strumPatterns";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";
import { normalizeBpm } from "@/lib/strumBars";
import { patternNotation } from "@/lib/strumNotation";
import {
	defaultProgressionName,
	parseChordSequence,
	progressionBarsFromChords,
} from "@/lib/strumProgressions";
import { parseRhythm, type RhythmParseError } from "@/lib/strumAssistant/parseRhythm";
import type { AssistantProposal } from "@/lib/strumAssistant/types";

/**
 * Turns notation plus chord words into something previewable.
 *
 * Both halves of the assistant land here — the deterministic route and the
 * model — so a proposal is assembled exactly one way no matter where the words
 * came from, and the model never gets its own path to `Bar[]`.
 */

/** Used when the user asked for chords but said nothing about rhythm. */
const DEFAULT_RHYTHM_PATTERN_ID = "4-4 old faithful";

function defaultRhythmNotation(): string {
	const preset = PRESET_STRUM_PATTERNS.find((p) => p.id === DEFAULT_RHYTHM_PATTERN_ID);
	// Derived from the preset rather than written out, so the two cannot drift.
	return preset ? patternNotation(preset.beats) : "D DU UD";
}

export interface BuildProposalInput {
	/** Notation. When absent a default rhythm is used and flagged as guessed. */
	rhythm?: string | null;
	/** Chord words exactly as typed or as the model wrote them. */
	chordWords: readonly string[];
	index: readonly ChordIndexEntry[];
	name?: string | null;
	bpm?: number | null;
	rhythmGuessed?: boolean;
	fellBackToDeterministic?: boolean;
}

export type BuildProposalResult =
	| { ok: true; proposal: AssistantProposal }
	| { ok: false; errors: RhythmParseError[] };

function barsFor(rhythmBars: Beat[][], chords: Bar["chord"][]): Bar[] {
	if (chords.length === 0) {
		return rhythmBars.map((beats) => ({ beats, chord: null }));
	}
	// One rhythm, many chords: every chord gets a bar of that rhythm. This is the
	// same assembly the progression editor uses when a sequence is typed.
	if (rhythmBars.length === 1) {
		return progressionBarsFromChords(
			rhythmBars[0],
			chords.filter((c): c is NonNullable<Bar["chord"]> => c !== null),
		);
	}
	// Written bar by bar: chords line up in order, and a bar past the last chord
	// keeps the rhythm with no chord rather than repeating one.
	return rhythmBars.map((beats, i) => ({ beats, chord: chords[i] ?? null }));
}

export function buildProposal(input: BuildProposalInput): BuildProposalResult {
	const guessedRhythm = input.rhythm == null || input.rhythm.trim() === "";
	const notation = guessedRhythm ? defaultRhythmNotation() : input.rhythm!;

	const parsed = parseRhythm(notation);
	if (!parsed.ok) return { ok: false, errors: parsed.errors };

	const sequence = parseChordSequence(input.chordWords.join(" "), input.index);
	const bars = barsFor(
		parsed.value.bars.map((b) => b.beats),
		sequence.chords,
	);
	const kind = sequence.chords.length > 0 ? "progression" : "pattern";

	const name =
		input.name?.trim() ||
		(kind === "progression" ? defaultProgressionName(bars) : "Assistant pattern");

	return {
		ok: true,
		proposal: {
			kind,
			name,
			rhythm: notation,
			bars,
			bpm: input.bpm == null ? null : normalizeBpm(input.bpm),
			chords: sequence.chords,
			warnings: {
				unresolvedChords: sequence.unmatched,
				rhythmGuessed: guessedRhythm || input.rhythmGuessed === true,
				padded: parsed.value.padded,
				fellBackToDeterministic: input.fellBackToDeterministic === true,
			},
		},
	};
}

/** The pattern a confirmed proposal is saved as. Bars carry any chords. */
export function proposalToPattern(proposal: AssistantProposal, id: string): StrumPattern {
	return {
		id,
		name: proposal.name,
		beats: proposal.bars[0]?.beats ?? [],
		...(proposal.bpm == null ? {} : { bpm: proposal.bpm }),
	};
}
