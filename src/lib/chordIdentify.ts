import { MUTED, type ShapeFret } from "@/lib/chordShape";
import { GUITAR_OPEN_MIDI, voicingPitches } from "@/lib/chordVoicingToMidi";
import { ROOT_CHROMATIC_ORDER, displayCategory, suffixRank } from "@/lib/chordSuffixes";
import type { ShapeSearchChord } from "@/lib/chordShapeSearch";

/**
 * Naming a shape from the notes it sounds. The candidate names come from the
 * library's own voicings, not a formula table, so every name offered is a chord
 * the app can also browse, play and draw.
 */

/** MIDI pitches a shape sounds, lowest string first. Muted strings contribute none. */
export function shapeMidi(frets: readonly ShapeFret[]): number[] {
	const sounding: number[] = [];
	frets.forEach((fret, stringIndex) => {
		if (fret === MUTED) return;
		sounding.push(GUITAR_OPEN_MIDI[stringIndex] + fret);
	});
	return sounding;
}

/** The distinct pitch classes in a set of pitches, ascending. */
export function pitchClassSet(midi: readonly number[]): number[] {
	return [...new Set(midi.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b);
}

/** The pitch class of the lowest note sounding, or null for a silent shape. */
export function bassPitchClass(midi: readonly number[]): number | null {
	if (midi.length === 0) return null;
	return ((Math.min(...midi) % 12) + 12) % 12;
}

/** The stored spelling of a pitch class — the twelve roots the library is written in. */
export function pitchClassRoot(pitchClass: number): string {
	return ROOT_CHROMATIC_ORDER[((pitchClass % 12) + 12) % 12];
}

/**
 * The notes a shape sounds, named, lowest first and each named once.
 *
 * Worth saying out loud precisely when nothing can be named: a player who is
 * told the grip is A, E, G and B can often finish the identification themselves,
 * and can always write it on the chart.
 */
export function shapeNoteNames(frets: readonly ShapeFret[]): string[] {
	const seen = new Set<number>();
	const names: string[] = [];
	for (const midi of [...shapeMidi(frets)].sort((a, b) => a - b)) {
		const pitchClass = ((midi % 12) + 12) % 12;
		if (seen.has(pitchClass)) continue;
		seen.add(pitchClass);
		names.push(pitchClassRoot(pitchClass));
	}
	return names;
}

export interface ChordGuess {
	root: string;
	suffix: string;
	/** Display category, the same one the name search reports. */
	category: string;
	/** Every note matches. False when the chord is one note away either way. */
	exact: boolean;
	/** The chord is voiced over the same bass note the shape is. */
	sameBass: boolean;
}

/** Two sets differing by at most one note, in either direction. */
function withinOneNote(a: readonly number[], b: readonly number[]): boolean {
	if (Math.abs(a.length - b.length) > 1) return false;
	const [small, large] = a.length <= b.length ? [a, b] : [b, a];
	const missing = small.filter((pc) => !large.includes(pc)).length;
	// Same length and one swapped is two notes apart in musical terms, not one.
	return missing === 0 && large.length - small.length <= 1;
}

function sameSet(a: readonly number[], b: readonly number[]): boolean {
	return a.length === b.length && a.every((pc, i) => pc === b[i]);
}

const DEFAULT_LIMIT = 4;

/**
 * What a shape could be called, best first.
 *
 * Exact answers crowd out the close ones entirely: a chord that has the notes
 * you played is not competing with one that nearly does, and listing both
 * invites the player to pick the wrong name for their own chord. Close ones are
 * offered only when nothing has exactly those notes, which is when a name that
 * is nearly right is still the most useful thing anyone can say.
 *
 * Within a tier, a chord voiced over the same bass note comes first — that is
 * what separates C from C/G, and the library's own slash chords make the
 * distinction without any inversion logic here.
 */
export function identifyChords(
	library: readonly ShapeSearchChord[],
	frets: readonly ShapeFret[],
	limit: number = DEFAULT_LIMIT,
): ChordGuess[] {
	const midi = shapeMidi(frets);
	const target = pitchClassSet(midi);
	// One note is a note, and two could be anything; a chord starts at three,
	// except for the power chord the library actually carries.
	if (target.length < 2) return [];
	const bass = bassPitchClass(midi);

	const best = new Map<string, ChordGuess>();

	for (const chord of library) {
		for (const voicing of chord.chord_voicings ?? []) {
			const voiced = voicingPitches(voicing);
			if (voiced.length === 0) continue;
			const set = pitchClassSet(voiced);
			const exact = sameSet(set, target);
			if (!exact && !withinOneNote(set, target)) continue;

			const guess: ChordGuess = {
				root: chord.root,
				suffix: chord.suffix,
				category: displayCategory(chord.suffix),
				exact,
				sameBass: bass !== null && bassPitchClass(voiced) === bass,
			};
			const key = `${chord.root} ${chord.suffix}`;
			const existing = best.get(key);
			// One row per chord, under whichever of its voicings answered best.
			if (existing && rank(existing) <= rank(guess)) continue;
			best.set(key, guess);
		}
	}

	const found = [...best.values()];
	const exact = found.filter((g) => g.exact);
	return (exact.length > 0 ? exact : found)
		.sort(
			(a, b) =>
				rank(a) - rank(b) ||
				suffixRank(a.suffix) - suffixRank(b.suffix) ||
				a.root.localeCompare(b.root),
		)
		.slice(0, limit);
}

/** Lower sorts first: the notes, then the bass. */
function rank(guess: ChordGuess): number {
	return (guess.exact ? 0 : 2) + (guess.sameBass ? 0 : 1);
}
