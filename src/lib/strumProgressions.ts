import {
	STRUM_CAPO_MAX,
	type Bar,
	type Beat,
	type ChordProgression,
	type ChordRef,
} from "@/lib/strumPatterns";
import { validateBars } from "@/lib/strumBars";
import { chordDisplayName } from "@/lib/chordSuffixes";
import { searchChords, type ChordIndexEntry } from "@/lib/chordSearch";

/** Written in place of a bar nobody assigned a chord to. */
export const NO_CHORD_LABEL = "—";

/**
 * Coerce anything claiming to be a capo fret into a usable one: rounded and
 * clamped to 0…`STRUM_CAPO_MAX`. A missing or unusable value means no capo.
 */
export function normalizeCapo(raw: unknown): number {
	if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
	return Math.min(STRUM_CAPO_MAX, Math.max(0, Math.round(raw)));
}

/** The capo a progression is played behind — 0 when it carries none. */
export function progressionCapo(progression: ChordProgression | null): number {
	return normalizeCapo(progression?.capo);
}

/** Separates chords in a progression's default name. */
const NAME_SEPARATOR = "|";

/**
 * The chord as a player would scribble it on a chart: `C`, `Am`, `G7`, `C/G`.
 * Plain majors carry no quality, minors collapse to `m`, everything else keeps
 * the stored suffix.
 */
export function chordAbbreviation(chord: ChordRef): string {
	if (chord.suffix === "major") return chord.root;
	if (chord.suffix === "minor") return `${chord.root}m`;
	return chordDisplayName(chord.root, chord.suffix).replace(" ", "");
}

/** The name a progression takes when the user gives it none: `"C|G|Am|F"`. */
export function defaultProgressionName(bars: Bar[]): string {
	if (bars.length === 0) return NO_CHORD_LABEL;
	return bars
		.map((bar) => (bar.chord ? chordAbbreviation(bar.chord) : NO_CHORD_LABEL))
		.join(NAME_SEPARATOR);
}

/** What a progression is listed under: its own name, else its chords. */
export function progressionDisplayName(progression: ChordProgression): string {
	const given = progression.name?.trim();
	return given && given !== "" ? given : defaultProgressionName(progression.bars);
}

/** Playing order for one pattern's progressions: by order index, oldest first. */
export function sortProgressions(progressions: ChordProgression[]): ChordProgression[] {
	return [...progressions].sort((a, b) => a.orderIndex - b.orderIndex);
}

/** The order index a progression appended to this list should take. */
export function nextOrderIndex(progressions: ChordProgression[]): number {
	return progressions.reduce((max, p) => Math.max(max, p.orderIndex + 1), 0);
}

/** The progressions belonging to one pattern, in playing order. */
export function progressionsForPattern(
	progressions: ChordProgression[],
	patternId: string,
): ChordProgression[] {
	return sortProgressions(progressions.filter((p) => p.patternId === patternId));
}

/** Whitespace, commas and pipes all separate chords in a typed sequence. */
const TOKEN_SEPARATOR = /[\s,|]+/;
/** A lone dash is a written separator ("C - G - Am"), not a chord. */
const DASH_ONLY = /^[-–—]+$/;

/** One word of a typed sequence and what it resolved to, if anything. */
export interface ChordToken {
	input: string;
	chord: ChordRef | null;
}

export interface ChordSequenceParse {
	/** Every token in typed order, resolved or not — what the preview lists. */
	tokens: ChordToken[];
	/** The chords that resolved, in typed order. */
	chords: ChordRef[];
	/** Tokens no chord in the index matched, kept verbatim for the error line. */
	unmatched: string[];
}

/**
 * Read a typed chord sequence — `"C G Am F"`, `"C - G - Am"`, `"C,G,Am"` — into
 * chord identities, resolving each token through the same ranked search the
 * chord picker uses, so anything the picker can find can also be typed.
 */
export function parseChordSequence(
	input: string,
	index: readonly ChordIndexEntry[],
): ChordSequenceParse {
	const tokens: ChordToken[] = [];

	for (const token of input.trim().split(TOKEN_SEPARATOR)) {
		if (token === "" || DASH_ONLY.test(token)) continue;
		const match = searchChords(index, token, 1)[0];
		tokens.push({
			input: token,
			chord: match ? { root: match.root, suffix: match.suffix, voicingId: null } : null,
		});
	}

	return {
		tokens,
		chords: tokens.map((t) => t.chord).filter((c): c is ChordRef => c !== null),
		unmatched: tokens.filter((t) => t.chord === null).map((t) => t.input),
	};
}

/** One bar per chord, every bar playing the pattern's own rhythm. */
export function progressionBarsFromChords(beats: Beat[], chords: ChordRef[]): Bar[] {
	return chords.map((chord) => ({ beats: beats.map((beat) => [...beat]), chord }));
}

/**
 * Carry an edit of the pattern's rhythm into a progression written over it.
 *
 * Only bars still playing the pattern's previous rhythm follow the edit; a bar
 * the user re-wrote in the progression editor has diverged on purpose and is
 * left as it is. Chords are never touched. Returns the input array unchanged
 * when nothing followed, so callers can skip the write.
 */
export function syncBarsToPattern(
	bars: Bar[],
	previousBeats: Beat[],
	nextBeats: Beat[],
): Bar[] {
	const previous = JSON.stringify(previousBeats);
	if (previous === JSON.stringify(nextBeats)) return bars;

	let changed = false;
	const next = bars.map((bar) => {
		if (JSON.stringify(bar.beats) !== previous) return bar;
		changed = true;
		return { ...bar, beats: nextBeats.map((beat) => [...beat]) };
	});
	return changed ? next : bars;
}

/**
 * Whether a sequence has a pattern edit waiting for an answer.
 *
 * Kept apart from the components so the decision — which is the whole feature —
 * can be read and tested in one place, rather than inferred from a condition
 * spread across a modal.
 */
export type PatternSyncState =
	/** The sequence already plays the pattern's current rhythm. */
	| { kind: "in-sync" }
	/**
	 * Written before the prompt existed. Nothing to diff against, so record the
	 * pattern's rhythm quietly and never mention it.
	 */
	| { kind: "backfill" }
	/**
	 * The pattern moved, but syncing would change nothing here — every bar has
	 * been re-written in the progression editor, or already reads the way the
	 * pattern does now. Record and say nothing: a question whose only answer
	 * changes nothing is worse than no question.
	 */
	| { kind: "no-change" }
	/** The pattern moved. `previousBeats` is what to sync from if the answer is yes. */
	| { kind: "ask"; previousBeats: Beat[] }
	/** The player has said no; this sequence has a rhythm of its own now. */
	| { kind: "detached" }
	/** Detached, and the player has dismissed the notice saying so. */
	| { kind: "detached-dismissed" };

export function patternSyncState(
	progression: ChordProgression,
	patternBeats: Beat[],
): PatternSyncState {
	if (progression.followsPattern === false) {
		return progression.syncNoticeDismissed === true
			? { kind: "detached-dismissed" }
			: { kind: "detached" };
	}
	if (!Array.isArray(progression.syncedBeats)) return { kind: "backfill" };
	if (JSON.stringify(progression.syncedBeats) === JSON.stringify(patternBeats)) {
		return { kind: "in-sync" };
	}

	// The pattern having moved is not on its own a reason to ask. What matters is
	// whether this sequence would change — a progression whose bars the player
	// re-wrote follows nothing, and asking it about every pattern edit is noise.
	// syncBarsToPattern returns its input by reference when no bar followed, so
	// the question is answered by the same code that would carry out the answer.
	const synced = syncBarsToPattern(progression.bars, progression.syncedBeats, patternBeats);
	if (synced === progression.bars) return { kind: "no-change" };

	return { kind: "ask", previousBeats: progression.syncedBeats };
}

/** Record the pattern's rhythm without touching the bars. Backfill, and "no". */
export function markPatternSynced(
	progression: ChordProgression,
	patternBeats: Beat[],
): ChordProgression {
	return { ...progression, syncedBeats: patternBeats.map((beat) => [...beat]) };
}

/**
 * Answer yes: carry the pattern edit in, then record that it has been carried.
 * Bars the player re-wrote inside the progression editor still keep their own
 * rhythm — that judgement lives in `syncBarsToPattern` and is unchanged.
 */
export function applyPatternSync(
	progression: ChordProgression,
	patternBeats: Beat[],
): ChordProgression {
	const state = patternSyncState(progression, patternBeats);
	const previous = state.kind === "ask" ? state.previousBeats : progression.bars[0]?.beats ?? [];
	return {
		...markPatternSynced(progression, patternBeats),
		bars: syncBarsToPattern(progression.bars, previous, patternBeats),
		followsPattern: true,
	};
}

/**
 * Answer no.
 *
 * The snapshot is deliberately left where it was. Moving it to the pattern's
 * current rhythm would strand the sequence: its bars would then match no
 * snapshot the pattern will ever have, every later edit would compute as
 * "nothing would change", and "follow again" would be a button that does
 * nothing. Reconsidering has to start from where the sequence actually stands.
 */
export function declinePatternSync(progression: ChordProgression): ChordProgression {
	return { ...progression, followsPattern: false };
}

/**
 * Follow the pattern again. Only lifts the refusal — whether anything is then
 * out of step is `patternSyncState`'s to say, so re-following a pattern that has
 * since moved asks the question again rather than applying it unseen.
 */
export function resumePatternSync(progression: ChordProgression): ChordProgression {
	// The dismissal goes with the refusal it was hiding. Following again is
	// re-engaging, so a later refusal deserves to be visible again rather than
	// inheriting a silence agreed to about a different decision.
	const { syncNoticeDismissed: _dismissed, ...rest } = progression;
	return { ...rest, followsPattern: true };
}

/**
 * Hide the "not following" notice for good.
 *
 * Separate from declining: saying no is about the rhythm, dismissing is about
 * being told. A player who has settled on their own rhythm does not need a
 * standing reminder, but one who has just decided might.
 */
export function dismissPatternNotice(progression: ChordProgression): ChordProgression {
	return { ...progression, syncNoticeDismissed: true };
}

/** Reading the two fields back from storage, where anything could be in them. */
export function normalizeProgressionSync(
	raw: { syncedBeats?: unknown; followsPattern?: unknown; syncNoticeDismissed?: unknown },
): { syncedBeats?: Beat[]; followsPattern?: boolean; syncNoticeDismissed?: boolean } {
	const out: {
		syncedBeats?: Beat[];
		followsPattern?: boolean;
		syncNoticeDismissed?: boolean;
	} = {};
	// A snapshot is one bar's worth of beats; validateBars is the existing guard.
	if (Array.isArray(raw.syncedBeats) && validateBars([{ beats: raw.syncedBeats, chord: null }]).ok) {
		out.syncedBeats = raw.syncedBeats as Beat[];
	}
	if (raw.followsPattern === false) out.followsPattern = false;
	if (raw.syncNoticeDismissed === true) out.syncNoticeDismissed = true;
	return out;
}
