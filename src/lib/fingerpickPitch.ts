import { pitchClassRoot } from "@/lib/chordIdentify";
import type { BeatSlot } from "@/lib/fingerpickTypes";

/**
 * The pitch a written fret sounds, and how to write it.
 *
 * A fingerpick TAB is written behind the capo: "6th string, 3rd fret" is the
 * same number whether or not a capo is on, and a player reading it has to work
 * out for themselves which note that is. This is the one place that works it
 * out — the scheduler compiles its events through `soundingMidi`, and the
 * reading page labels its frets through `pitchLabel`, so what is written under
 * a fret and what plays can never disagree.
 */

/**
 * Standard guitar tuning MIDI notes for open strings.
 * Index 0 = high e (E4 = 64), index 5 = low E (E2 = 40).
 */
export const OPEN_STRING_MIDI: readonly number[] = [64, 59, 55, 50, 45, 40];

/** How a sounding pitch is written under its fret. */
export type PitchLabelStyle = "name" | "scientific" | "midi" | "jianpu";

export const PITCH_LABEL_STYLES: readonly PitchLabelStyle[] = [
	"name",
	"scientific",
	"midi",
	"jianpu",
];

/**
 * Jianpu (numbered notation), fixed-do in C: the degree 1–7, an accidental
 * written before it (`#1`, `b3` — the library's spelling), and octave dots
 * over or under it. The dots are carried as Unicode combining marks so the
 * label stays one string; a renderer splits them off with `splitPitchLabel`.
 */
export const JIANPU_DOT_ABOVE = "\u0307";
export const JIANPU_DOT_BELOW = "\u0323";
const JIANPU_DEGREE: Readonly<Record<string, string>> = {
	C: "1",
	"C#": "#1",
	D: "2",
	Eb: "b3",
	E: "3",
	F: "4",
	"F#": "#4",
	G: "5",
	Ab: "b6",
	A: "6",
	Bb: "b7",
	B: "7",
};
// The octave written without dots. Guitar is written an octave above where it
// sounds, so the undotted octave is the sounding C3–B3: the open D, G and B
// strings are plain 2 5 7, the open high e is 3 with a dot above, and the low
// E and A carry a dot below — the chart every Chinese guitar primer opens with.
const JIANPU_MIDDLE_OCTAVE = 3;

export function isPitchLabelStyle(value: unknown): value is PitchLabelStyle {
	return PITCH_LABEL_STYLES.includes(value as PitchLabelStyle);
}

/**
 * The MIDI pitch that a fret on a string sounds with a capo on. Fret 0 is the
 * open string, sounding at the capo.
 */
export function soundingMidi(stringIndex: number, fret: number, capo: number): number {
	return OPEN_STRING_MIDI[stringIndex] + capo + fret;
}

/**
 * A pitch written in the chosen style: the note name alone (`F#`, spelt as the
 * chord library spells its roots, so the label under a fret agrees with the
 * chord symbol over it), scientific pitch (`F#4`, middle C = C4 = 60), or the
 * MIDI number.
 */
export function pitchLabel(midi: number, style: PitchLabelStyle): string {
	const octave = Math.floor(midi / 12) - 1;
	switch (style) {
		case "midi":
			return String(midi);
		case "name":
			return pitchClassRoot(midi % 12);
		case "scientific":
			return `${pitchClassRoot(midi % 12)}${octave}`;
		case "jianpu": {
			const dots = octave - JIANPU_MIDDLE_OCTAVE;
			const mark = dots > 0 ? JIANPU_DOT_ABOVE : JIANPU_DOT_BELOW;
			return JIANPU_DEGREE[pitchClassRoot(midi % 12)] + mark.repeat(Math.abs(dots));
		}
	}
}

/** A label's visible text and its octave dots, for a renderer that draws the dots itself. */
export interface SplitPitchLabel {
	base: string;
	dotsAbove: number;
	dotsBelow: number;
}

export function splitPitchLabel(text: string): SplitPitchLabel {
	let dotsAbove = 0;
	let dotsBelow = 0;
	for (const ch of text) {
		if (ch === JIANPU_DOT_ABOVE) dotsAbove++;
		else if (ch === JIANPU_DOT_BELOW) dotsBelow++;
	}
	return {
		base: text.replaceAll(JIANPU_DOT_ABOVE, "").replaceAll(JIANPU_DOT_BELOW, ""),
		dotsAbove,
		dotsBelow,
	};
}

/** One label under a note: which string it is for, what it says, and whether the string is only held. */
export interface SlotPitchLabel {
	stringIndex: number;
	text: string;
	/** The string is tied from the slot before — sounding, not struck — so the label is drawn fainter. */
	tied: boolean;
}

/**
 * The labels a slot gets, in string order (high e first), matching the stave.
 * A rest or grace slot gets none; so does a muted string (an `x` sounds no
 * pitch) and a string not in play.
 */
export function slotPitchLabels(
	slot: Pick<BeatSlot, "strings" | "isRest" | "isGraceNote">,
	label: (stringIndex: number, fret: number) => string,
): SlotPitchLabel[] {
	if (slot.isRest || slot.isGraceNote) return [];
	const labels: SlotPitchLabel[] = [];
	slot.strings.forEach((sf, stringIndex) => {
		if (sf.fret === null || sf.muted) return;
		labels.push({ stringIndex, text: label(stringIndex, sf.fret), tied: sf.tied });
	});
	return labels;
}
