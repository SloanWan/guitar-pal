/**
 * Two layers on one board: the scale as light marks, the chord sounding now as
 * solid marks. Most apps put scales and chords on separate pages; this view is
 * the one that shows which scale notes are safe over the current chord.
 *
 * Chord tones come from a voicing's MIDI pitches reduced to pitch classes, so
 * no suffix → interval table is needed. Known limitation, accepted for v1: a
 * voicing that omits a chord tone (some five-string shapes drop the fifth)
 * leaves that tone out of the overlay.
 */
import { createLabeler, pitchClassAt, type LabelMode, type ScaleSpec } from "./scales";
import {
	STRING_COUNT,
	slotKey,
	type ChordToneRole,
	type FretMark,
	type FretWindow,
} from "./types";

export interface ChordTones {
	/** Distinct pitch classes, 0..11. */
	pitchClasses: readonly number[];
	/** Pitch class of the chord root; when absent no mark is emphasised as root. */
	rootPitchClass?: number;
}

/** Reduce a voicing's MIDI pitches to the chord's distinct pitch classes. */
export function chordTonesFromMidi(midi: readonly number[], rootPitchClass?: number): ChordTones {
	const pitchClasses = [...new Set(midi.map((m) => ((m % 12) + 12) % 12))].sort((a, b) => a - b);
	return rootPitchClass === undefined ? { pitchClasses } : { pitchClasses, rootPitchClass };
}

/**
 * Which member of the chord a pitch class is, by its interval above the chord
 * root: minor and major thirds are both the third, diminished, perfect and
 * augmented fifths all the fifth, minor and major sevenths the seventh, and the
 * rest (2nds, 4ths, 6ths as they appear in 9/11/13 and sus voicings) extensions.
 */
export function chordToneRole(semitonesAboveRoot: number): ChordToneRole {
	switch (((semitonesAboveRoot % 12) + 12) % 12) {
		case 3:
		case 4:
			return "third";
		case 6:
		case 7:
		case 8:
			return "fifth";
		case 10:
		case 11:
			return "seventh";
		default:
			return "extension";
	}
}

/**
 * Lay the chord over the scale. Inside the window, every chord tone becomes a
 * `chordTone` mark (the chord root becomes the `root`), whether or not it is in
 * the scale — an outside note is exactly what a player needs to see. Scale
 * tones the chord does not use stay `scaleTone`, the scale's own root among
 * them: denim marks what is sounding, and the degree label still says "1".
 *
 * Labels are the scale's, so a chord tone reads in the key the player is
 * thinking in; a non-diatonic tone is named through the same labeler.
 */
export function overlayChordTones(
	scale: readonly FretMark[],
	chord: ChordTones,
	spec: ScaleSpec,
	window: FretWindow,
	mode: LabelMode,
): FretMark[] {
	const scaleByKey = new Map<string, FretMark>();
	for (const mark of scale) scaleByKey.set(slotKey(mark.string, mark.fret), mark);
	const chordSet = new Set(chord.pitchClasses);
	const label = createLabeler(spec, mode);

	const marks: FretMark[] = [];
	for (let string = 0; string < STRING_COUNT; string++) {
		for (let fret = window.fromFret; fret <= window.toFret; fret++) {
			const pc = pitchClassAt(string, fret);
			const scaleMark = scaleByKey.get(slotKey(string, fret));
			if (chordSet.has(pc)) {
				const base = { string, fret, label: scaleMark?.label ?? label(pc) };
				if (chord.rootPitchClass === undefined) {
					marks.push({ ...base, emphasis: "chordTone" });
				} else if (pc === chord.rootPitchClass) {
					marks.push({ ...base, emphasis: "root" });
				} else {
					marks.push({ ...base, emphasis: "chordTone", tone: chordToneRole(pc - chord.rootPitchClass) });
				}
			} else if (scaleMark) {
				marks.push({
					...scaleMark,
					emphasis: scaleMark.emphasis === "root" ? "scaleTone" : scaleMark.emphasis,
				});
			}
		}
	}
	return marks;
}
