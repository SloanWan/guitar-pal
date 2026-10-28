import type { ChordTone } from "@/lib/chordFormulas";
import { withGlyphs } from "@/lib/chordFormulas";
import { GUITAR_OPEN_MIDI, NOTE_NAMES } from "@/lib/chordVoicingToMidi";

/**
 * "On the neck" on the chord page: every tone of the chord up to the 15th fret, the
 * shape shown boxed, and a marker per shape to jump to it. Positions are percentages
 * of the neck's width, so the drawing scales with its box.
 */

/** The highest fret drawn. */
export const NECK_FRETS = 15;
/** Fret numbers written over the neck. */
export const NECK_FRET_NUMBERS: readonly number[] = [0, 1, 3, 5, 7, 9, 12, 15];
/** Single inlays; the 12th has two. */
export const NECK_INLAYS: readonly number[] = [3, 5, 7, 9, 15];

/** Where the nut sits, and how wide each fret is, in % of the neck. */
const NUT_X = 4;
const FRET_W = (100 - NUT_X) / (NECK_FRETS + 0.67);

/** The x of the wire after fret `n` (0 = the nut). */
export function fretWireX(n: number): number {
	return NUT_X + n * FRET_W;
}

/** The x a note on `fret` is drawn at: mid-fret, or left of the nut for an open string. */
export function fretNoteX(fret: number): number {
	return fret === 0 ? NUT_X / 2 : NUT_X + (fret - 0.5) * FRET_W;
}

/** The y of a string, in % of the neck's height: high e at the top, as tab reads. */
export function stringY(string: number): number {
	return ((5 - string) / 5) * 84 + 8;
}

/** One pitch class the neck marks, with what its dots say. */
export interface NeckTone {
	readonly pc: number;
	readonly label: string;
	readonly root: boolean;
}

/**
 * The pitch classes to mark: the chord's tones labelled by degree, then any note the
 * shape sounds that the formula does not name (a slash chord's bass), by its name.
 * Without a formula, every note of the shape by its name.
 */
export function neckTones(rootPc: number, tones: readonly ChordTone[] | null, frets: readonly number[]): NeckTone[] {
	const out: NeckTone[] = [];
	const seen = new Set<number>();
	for (const tone of tones ?? []) {
		const pc = (rootPc + tone.semitones) % 12;
		if (seen.has(pc)) continue;
		seen.add(pc);
		out.push({ pc, label: tone.degree, root: pc === rootPc });
	}
	frets.forEach((fret, s) => {
		if (fret < 0) return;
		const pc = (GUITAR_OPEN_MIDI[s] + fret) % 12;
		if (seen.has(pc)) return;
		seen.add(pc);
		out.push({ pc, label: withGlyphs(NOTE_NAMES[pc]), root: pc === rootPc });
	});
	return out;
}

/** A tone on one string and fret; `held` when the shape shown plays it. */
export interface NeckDot {
	readonly string: number;
	readonly fret: number;
	readonly label: string;
	readonly root: boolean;
	readonly held: boolean;
}

/** Every place on the neck a marked tone can be played, string by string. */
export function neckDots(tones: readonly NeckTone[], frets: readonly number[]): NeckDot[] {
	const byPc = new Map(tones.map((t) => [t.pc, t]));
	const dots: NeckDot[] = [];
	for (let s = 0; s < 6; s++) {
		for (let fret = 0; fret <= NECK_FRETS; fret++) {
			const tone = byPc.get((GUITAR_OPEN_MIDI[s] + fret) % 12);
			if (tone) dots.push({ string: s, fret, label: tone.label, root: tone.root, held: frets[s] === fret });
		}
	}
	return dots;
}

/** The box around a shape: from its lowest to its highest sounding fret, in % of the neck. */
export function shapeBox(frets: readonly number[]): { left: number; width: number } {
	const sounding = frets.filter((f) => f >= 0);
	if (sounding.length === 0) return { left: 0.4, width: fretWireX(1) - 0.8 };
	const lo = Math.min(...sounding);
	const hi = Math.max(...sounding);
	const left = lo === 0 ? 0.4 : fretWireX(lo - 1) + 0.4;
	return { left, width: fretWireX(Math.max(hi, 1)) - 0.4 - left };
}

/** Where a shape's marker sits: the middle of its fretted notes, or the first fret for an open shape. */
export function shapeCentreX(frets: readonly number[]): number {
	const fretted = frets.filter((f) => f > 0);
	if (fretted.length === 0) return fretNoteX(1);
	return fretNoteX((Math.min(...fretted) + Math.max(...fretted)) / 2);
}

/**
 * Markers kept at least `gap` apart, in their order along the neck: two shapes in
 * the same place sit side by side instead of on top of each other. Returns the x
 * for each input, in the input's order.
 */
export function spreadMarkers(xs: readonly number[], gap: number): number[] {
	const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x || a.i - b.i);
	const out = new Array<number>(xs.length);
	let last = -Infinity;
	for (const { x, i } of order) {
		out[i] = Math.max(x, last + gap);
		last = out[i];
	}
	// Whatever was pushed past the end slides back, and the ones before it with it.
	let limit = 100 - gap / 2;
	for (const { i } of [...order].reverse()) {
		out[i] = Math.min(out[i], limit);
		limit = out[i] - gap;
	}
	return out;
}
