import {
	STRUM_CAPO_MAX,
	type Bar,
	type Beat,
	type ChordProgression,
	type ChordRef,
} from "@/lib/strumPatterns";
import { barPlaceholder } from "@/lib/strumBars";
import { rhythmBarAt } from "@/lib/strumRhythm";
import { chordDisplayName } from "@/lib/chordSuffixes";
import { searchChords, type ChordIndexEntry } from "@/lib/chordSearch";
import { parseTabSequence } from "@/lib/chordTabSequence";
import type { ShapeFret } from "@/lib/chordShape";

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

/**
 * The name a progression takes when the user gives it none: `"C|G|Am|F"`.
 *
 * A bar kept as a name the library has no chord for is listed under that name,
 * not as `—`: the sequence is called what the player wrote, whether or not we
 * can play all of it yet.
 */
export function defaultProgressionName(bars: Bar[]): string {
	if (bars.length === 0) return NO_CHORD_LABEL;
	return bars
		.map((bar) =>
			bar.chord
				? chordAbbreviation(bar.chord)
				: (barPlaceholder(bar) ?? NO_CHORD_LABEL),
		)
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
/**
 * A dash between chords with no space around it ("C-G-Am-F") — the way a chord
 * line is most often written. Not a top-level separator, because a shape may be
 * written dashed too ("0-1-0-2-2-0"), and that has to stay one token.
 */
const DASH = /[-–—]+/;

/** One word of a typed sequence and what it resolved to, if anything. */
export interface ChordToken {
	input: string;
	chord: ChordRef | null;
	/**
	 * The word was six frets rather than a name. It changes what to offer when
	 * nothing matched: a name nobody knows can be kept as written, but a shape
	 * nobody is holding is a chord waiting to be written down.
	 */
	shape?: boolean;
}

/**
 * Resolves a written shape to the chord held that way, if any.
 *
 * Injected rather than done here: matching frets needs every voicing in the
 * library, which is far more than the name index this module is handed and is
 * not worth fetching for the many sequences that are only names.
 */
export type ShapeResolver = (frets: ShapeFret[]) => ChordRef | null;

/** The words of a typed sequence, separators dropped. */
const BARE_NUMBER = /^\d+$/;

function sequenceTokens(input: string): string[] {
	return input
		.trim()
		.split(TOKEN_SEPARATOR)
		.filter((token) => token !== "" && !DASH_ONLY.test(token))
		// Only a token that does not read as a shape splits on its dashes: no
		// chord suffix in the library contains one, so a dash inside a word that
		// is not six frets can only be joining chords.
		.flatMap((token) =>
			DASH.test(token) && parseTabSequence(token).frets === null
				? token.split(DASH).filter((part) => part !== "")
				: [token],
		);
}

/**
 * Whether a sequence has a written shape in it — asked before parsing, so the
 * voicings needed to resolve one are fetched only when there is one.
 */
export function hasShapeToken(input: string): boolean {
	return sequenceTokens(input).some((token) => parseTabSequence(token).frets !== null);
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
 *
 * A word that reads as six frets is a shape rather than a name: charts are
 * frequently written that way, and a player copying one should not have to look
 * up what each grip is called first. It resolves to the chord held exactly that
 * way, pinned to that voicing.
 */
export function parseChordSequence(
	input: string,
	index: readonly ChordIndexEntry[],
	resolveShape?: ShapeResolver,
): ChordSequenceParse {
	const tokens: ChordToken[] = [];

	for (const token of sequenceTokens(input)) {
		const frets = parseTabSequence(token).frets;
		if (frets) {
			tokens.push({ input: token, chord: resolveShape?.(frets) ?? null, shape: true });
			continue;
		}
		// A bare number is never a chord: the ranked search would still hand
		// back its nearest suffix ("5" → C5, "13" → Cmaj13), and a pick order
		// like "5 3 2 1" would read as a progression.
		const match = BARE_NUMBER.test(token) ? undefined : searchChords(index, token, 1)[0];
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

/** How a typed word the chord library cannot match is dealt with. */
export type UnknownChordChoice = "skip" | "keep";

/**
 * The words that become bars, once the unknown-chord question has an answer.
 * "skip" drops them; "keep" writes them down as they were typed.
 */
export function keptTokens(
	tokens: readonly ChordToken[],
	choice: UnknownChordChoice,
): ChordToken[] {
	return choice === "keep" ? [...tokens] : tokens.filter((t) => t.chord !== null);
}

/**
 * One bar per typed word, every bar playing the pattern's rhythm — the first
 * word over its first bar, and on round a rhythm of several bars.
 *
 * A word that resolved becomes an ordinary chorded bar. One that did not is
 * kept verbatim as a placeholder: the bar holds its place and its name, and
 * sounds nothing until a chord is picked for it.
 */
export function progressionBarsFromTokens(
	rhythm: readonly Beat[][],
	tokens: readonly ChordToken[],
): Bar[] {
	return tokens.map((token, i) => ({
		beats: rhythmBarAt(rhythm, i).map((beat) => [...beat]),
		chord: token.chord,
		...(token.chord ? {} : { unknownChord: token.input }),
	}));
}
