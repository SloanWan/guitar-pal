import type { Meter } from "@/lib/strumMeter";

export type StepValue = "D" | "U" | "X" | "" | "DG" | "UG" | "D3" | "U3";

export type Beat = StepValue[]; // length = 1|2|3|4|6 — see allowedCellsPerBeat

/**
 * Chord identity as stored on a pattern. Frets and pitches are never stored
 * inline — they are always looked up from the `chords` / `chord_voicings`
 * tables via `resolveBarChords` in `strumBars.ts`.
 */
export interface ChordRef {
	root: string;
	suffix: string;
	/** Pin a specific voicing; when absent the standard voicing is used. */
	voicingId?: string | null;
}

/** One bar of a pattern: its beats plus the chord played over them. */
export interface Bar {
	beats: Beat[];
	chord: ChordRef | null;
}

/**
 * A strum pattern is one bar of rhythm. Chords never live here — the pattern
 * tab's chord picker is session-only, and saved chord sequences are
 * `ChordProgression`s hanging off the pattern.
 *
 * There is no stored description: it is written from `beats` on read by
 * `patternNotation` in strumNotation.ts.
 */
export interface StrumPattern {
	id: string;
	name: string;
	beats: Beat[];
	/** Tempo the pattern loads at. Read it through `patternBpm`. */
	bpm?: number;
	/**
	 * Time signature. Absent means 4/4, which is what every pattern stored
	 * before meters existed is. Read it through `patternMeter`, never directly,
	 * so the fallback lives in one place.
	 *
	 * This is the only thing that tells a three-cell beat of 6/8 apart from a
	 * triplet in 4/4 — the cells are identical.
	 */
	meter?: Meter;
}

/**
 * A chord sequence played over a pattern: one or more bars, each carrying its
 * own rhythm and chord. Stored per user, and attachable to preset patterns as
 * well as the user's own.
 */
export interface ChordProgression {
	id: string;
	/** The `StrumPattern` this sequence extends — a preset id or a custom one. */
	patternId: string;
	bars: Bar[];
	/** Ordering within the pattern's progression list. */
	orderIndex: number;
	/** User-given name. Empty or absent falls back to the chord abbreviations. */
	name?: string;
	/** Tempo this sequence plays at; falls back to the pattern's own. */
	bpm?: number;
	/**
	 * Capo fret the chords are fingered behind. The chords name the shapes the
	 * player holds, so playback sounds this many semitones higher. 0 = no capo.
	 */
	capo?: number;
	/**
	 * The pattern rhythm this sequence was last reconciled with.
	 *
	 * Also the "before" argument `syncBarsToPattern` needs, which is why this is
	 * a snapshot and not a dirty flag. Absent means the sequence predates the
	 * reconcile prompt: there is no baseline to diff or to sync from, so it is
	 * backfilled silently rather than being asked about.
	 */
	syncedBeats?: Beat[];
	/** False once the player has declined to follow the pattern. */
	followsPattern?: boolean;
	/**
	 * True once the player has dismissed the "not following" notice. A third
	 * piece of information, not derivable from the other two: a sequence can have
	 * stopped following and still want to be reminded that it has.
	 */
	syncNoticeDismissed?: boolean;
}

/** Tempo bounds shared by the transport fader and the pattern editor. */
export const STRUM_BPM_MIN = 40;
export const STRUM_BPM_MAX = 220;
/** Tempo a pattern loads at when it carries no BPM of its own. */
export const DEFAULT_STRUM_BPM = 80;

/** Highest capo fret offered; past this the samples stop sounding like a guitar. */
export const STRUM_CAPO_MAX = 12;

export const PRESET_STRUM_PATTERNS: StrumPattern[] = [
	{
		id: "4-4 on the one",
		name: "on the one",
		beats: [
			["D", "UG"],
			["", ""],
			["", ""],
			["", ""],
		],
	},
	{
		id: "4-4 on the beats",
		name: "on the beat",
		beats: [
			["D", "UG"],
			["D", "UG"],
			["D", "UG"],
			["D", "UG"],
		],
	},
	{
		id: "4-4 old faithful",
		name: "old faithful",
		beats: [
			["D", "UG"],
			["D", "U"],
			["DG", "U"],
			["D", "UG"],
		],
	},
	{
		id: "4-4 triplet on one",
		name: "triplet on one",
		beats: [
			["D3", "U3", "D3"],
			["D", "UG"],
			["D", "UG"],
			["D", "UG"],
		],
	},
	{
		id: "4-4 boaf",
		name: "birds of a feather",
		beats: [
			["D", "UG", "DG", "U"],
			["D", "U", "D", "UG"],
			["DG", "U", "D", "U"],
			["D", "UG", "D", "U"],
		],
	},
	{
		id: "3-4 test",
		name: "hualala",
		beats: [
			["D", "UG", "DG"],
			["D", "U", "D"],
			["D", "UG", "DG"],
			["D", "U", "D"],
		],
	},
	{
		id: "4-4 triplet on 1 and 3",
		name: "triplet on 1+3",
		beats: [
			["D3", "U3", "D3"],
			["D", "UG"],
			["D3", "U3", "D3"],
			["D", "UG"],
		],
	},
	{
		id: "muted",
		name: "muted",
		beats: [
			["D", "X", "U", "X"],
			["D", "X", "U", "X"],
			["U", "X"],
			["D", "X"],
		],
	},
];
