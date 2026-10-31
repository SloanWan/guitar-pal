import { resolveAssistantTurn, type AssistantTurnOutcome } from "@/lib/assistant/strum/turn";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { transposeChord } from "@/lib/chordBoard";
import { chordSymbol } from "@/lib/chordSuffixes";
import type { ChordVoicing } from "@/lib/chordVoicing";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import type { VoicingLookup } from "@/lib/strumBars";
import type { Meter } from "@/lib/strumMeter";
import { PRESET_STRUM_PATTERNS, type Bar, type Beat, type ChordProgression, type ChordRef } from "@/lib/strumPatterns";
import { patternRhythm } from "@/lib/strumRhythm";

/**
 * The one song the landing page walks from a sentence to the player's hands:
 * its chords, the app's own strum and fingerpick presets for it, and what
 * each step of the page shows. Everything here is data the real readers and
 * engines consume — the page draws and plays it, it does not fake it.
 */

export const SONG = {
	title: "Birds of a Feather",
	artist: "Billie Eilish",
	year: 2024,
	capo: 2,
	bpm: 100,
	meter: [4, 4] as Meter,
	/** Where the chords were taken from; credited wherever the song is shown. */
	source: { label: "GuitarZero2Hero's tutorial", url: "https://www.youtube.com/watch?v=mkx4ZNN4hoQ" },
} as const;

/** The strum preset the song plays (`strumPatterns.ts`). */
export const SONG_STRUM_PATTERN_ID = "4-4 boaf";
/** The fingerpick preset the song's picking comes from (`fingerpickPatterns.ts`). */
export const SONG_TAB_PATTERN_ID = "birds-of-a-feather";
/** How many of the fingerpick preset's measures the page shows and plays: one for each bar of the song. */
export const SONG_TAB_MEASURES = 8;

const open = (id: string, frets: string, fingers: string): ChordVoicing => ({
	id,
	label: null,
	start_fret: 1,
	barre_fret: null,
	capo: false,
	frets,
	fingers,
});

export interface SongShape {
	chord: ChordRef;
	/** As the library prints it: "Am7". */
	name: string;
	/** What it sounds as behind the capo: "Bm7". */
	sounds: string;
	/** Its degree in the key the shapes are fingered in (C major). */
	numeral: string;
	/** The open voicing drawn and strummed — the library's standard shape. */
	voicing: ChordVoicing;
}

function shape(root: string, suffix: string, numeral: string, voicing: ChordVoicing): SongShape {
	const sounding = transposeChord(root, suffix, SONG.capo);
	if (!sounding) throw new Error(`Cannot transpose ${root} ${suffix}`);
	return {
		chord: { root, suffix },
		name: chordSymbol(root, suffix),
		sounds: chordSymbol(sounding.root, sounding.suffix),
		numeral,
		voicing,
	};
}

/** The four shapes, in the order the song meets them. */
export const SONG_SHAPES: readonly SongShape[] = [
	shape("C", "major", "I", open("song-c", "x32010", "032010")),
	shape("A", "m7", "vi", open("song-am7", "x02010", "002010")),
	shape("D", "m7", "ii", open("song-dm7", "xx0211", "000211")),
	shape("G", "major", "V", open("song-g", "320003", "210003")),
];

/** Standard tuning, string 6 (low E) first, as MIDI. */
const TUNING = [40, 45, 50, 55, 59, 64] as const;

/** The notes a shape sounds as fingered (no capo), low string first — what the neck lights up. */
export function shapeMidi(voicing: ChordVoicing): number[] {
	return [...voicing.frets].flatMap((f, i) => (f === "x" ? [] : [TUNING[i] + Number.parseInt(f, 36)]));
}

/** One chord a bar, two bars each: C | C | Am7 | Am7 | Dm7 | Dm7 | G | G. */
export const SONG_BAR_SHAPES: readonly number[] = [0, 0, 1, 1, 2, 2, 3, 3];

function preset<T extends { id: string }>(list: readonly T[], id: string): T {
	const found = list.find((p) => p.id === id);
	if (!found) throw new Error(`Missing preset ${id}`);
	return found;
}

/** The strum preset's rhythm, bar by bar. */
export const SONG_RHYTHM: Beat[][] = patternRhythm(preset(PRESET_STRUM_PATTERNS, SONG_STRUM_PATTERN_ID));

/** The chord sequence over the rhythm, as Strum stores one. */
export const SONG_PROGRESSION: ChordProgression = {
	id: "landing-song",
	patternId: SONG_STRUM_PATTERN_ID,
	name: SONG.title,
	orderIndex: 0,
	bpm: SONG.bpm,
	capo: SONG.capo,
	bars: SONG_BAR_SHAPES.map(
		(i, bar): Bar => ({ beats: SONG_RHYTHM[bar % SONG_RHYTHM.length], chord: SONG_SHAPES[i].chord }),
	),
};

/** The fingerpick preset cut to the measures the page shows, at the song's tempo. */
export const SONG_TAB: FingerpickPattern = (() => {
	const full = preset(PRESET_FINGERPICK_PATTERNS, SONG_TAB_PATTERN_ID);
	return { ...full, bpm: SONG.bpm, measures: full.measures.slice(0, SONG_TAB_MEASURES) };
})();

/**
 * The song's bar a tab measure sits over. The picked measures follow the
 * progression from its start, so measure n is bar n (C, C, Am7, Am7, …).
 */
export function tabMeasureBar(measureIndex: number): number {
	return measureIndex % SONG_BAR_SHAPES.length;
}

/** Voicings for the song's chords without a library round trip: the shapes the page draws. */
export const songVoicingLookup: VoicingLookup = async (ref) => {
	const hit = SONG_SHAPES.find((s) => s.chord.root === ref.root && s.chord.suffix === ref.suffix);
	return hit ? [hit.voicing] : null;
};

/** What step 1 types: the chords, the strum preset's rhythm as strokes, the tempo and capo. */
export const SONG_SENTENCE = "C C Am7 Am7 Dm7 Dm7 G G, D--UDUD--UDUD-DU at 100 bpm capo 2";

const SONG_INDEX: readonly ChordIndexEntry[] = SONG_SHAPES.map((s) => s.chord);

/** The rules reader's answer to that sentence — the card step 1 shows is the reader's own. */
export const SONG_TURN: AssistantTurnOutcome = resolveAssistantTurn({ text: SONG_SENTENCE, index: SONG_INDEX });
