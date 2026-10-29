import type { EffectKind, NoteEffects } from "@/lib/fingerpickTypes";

/**
 * What the editor writes when a technique is switched on, and the choices an
 * effect's parameter offers — shared by every editing surface, so a kind added
 * to the registry is offered with something to write.
 */

/** A bend's height in semitones, as it is read: ¼ … 1½ tones. */
export const BEND_HEIGHT_LABEL: Record<number, string> = {
	0.5: "¼",
	1: "½",
	1.5: "¾",
	2: "Full",
	2.5: "1¼",
	3: "1½",
};

/**
 * What an effect writes when switched on from the menu — every kind, so a
 * kind added to the registry cannot be offered with nothing to write. Bend
 * and vibrato have their own rows.
 */
export const DEFAULT_PARAMS: { [K in EffectKind]: NonNullable<NoteEffects[K]> } = {
	bend: { semitones: 2 },
	vibrato: {},
	harmonic: { type: "natural" },
	tap: true,
	trill: {},
	tremolo: { speed: "16th" },
	pick: { direction: "down" },
	accent: true,
	staccato: true,
	ghost: true,
	slideIn: { from: "below" },
	slideOut: { to: "below" },
	whammy: { kind: "dive" },
	scrape: true,
};

/** The choices an effect's parameter offers, as chips beside its row. */
export const VARIANTS: { [K in EffectKind]?: { label: string; title: string; params: NoteEffects[K] }[] } = {
	harmonic: [
		{ label: "N.H.", title: "Natural harmonic: touch the string over the fret", params: { type: "natural" } },
		{ label: "A.H.", title: "Artificial harmonic: fret the note, touch an octave up", params: { type: "artificial" } },
		{ label: "P.H.", title: "Pinch harmonic: the thumb catches the string as it is picked", params: { type: "pinch" } },
	],
	tremolo: [
		{ label: "8", title: "Eighth-note strokes", params: { speed: "8th" } },
		{ label: "16", title: "Sixteenth-note strokes", params: { speed: "16th" } },
		{ label: "32", title: "Thirty-second-note strokes", params: { speed: "32nd" } },
	],
	pick: [
		{ label: "⊓", title: "Downstroke", params: { direction: "down" } },
		{ label: "V", title: "Upstroke", params: { direction: "up" } },
	],
	slideIn: [
		{ label: "↗", title: "Slide in from below", params: { from: "below" } },
		{ label: "↘", title: "Slide in from above", params: { from: "above" } },
	],
	slideOut: [
		{ label: "↘", title: "Slide out downwards", params: { to: "below" } },
		{ label: "↗", title: "Slide out upwards", params: { to: "above" } },
	],
	whammy: [
		{ label: "dive", title: "Dive a tone and hold", params: { kind: "dive" } },
		{ label: "dive↩", title: "Dive a tone and come back by the note's end", params: { kind: "dive", release: true } },
		{ label: "pull", title: "Pull up a tone and hold", params: { kind: "pull" } },
		{ label: "pull↩", title: "Pull up a tone and come back", params: { kind: "pull", release: true } },
	],
};
