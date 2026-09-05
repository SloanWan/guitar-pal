import {
	STRUM_CAPO_MAX,
	type Bar,
	type Beat,
	type ChordProgression,
	type ChordRef,
} from "@/lib/strumPatterns";
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
