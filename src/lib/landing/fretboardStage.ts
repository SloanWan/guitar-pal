import { keyChords, type KeyChord } from "@/lib/fretboard/chords";
import { chordTonesFromMidi, overlayChordTones } from "@/lib/fretboard/overlay";
import { scaleMarks, scaleRootPitchClass, type ScaleSpec } from "@/lib/fretboard/scales";
import type { FretMark, FretWindow } from "@/lib/fretboard/types";
import { seg } from "./progress";

/**
 * The fretboard chapter's story: A minor pentatonic lights up the neck fret
 * by fret, an Am shape is laid over it so the chord tones stand out, and the
 * piano below shows the key's diatonic chords with Am pressed.
 */

export const FRETBOARD_DEMO_SPEC: ScaleSpec = { root: "A", scale: "minorPentatonic" };
/** The open cell plus fifteen frets: exactly what the neck fits without scrolling. */
export const FRETBOARD_DEMO_WINDOW: FretWindow = { fromFret: 0, toFret: 15 };
/** Open Am, x02210, as it sounds. */
export const FRETBOARD_DEMO_CHORD_MIDI: readonly number[] = [45, 52, 57, 60, 64];
export const FRETBOARD_DEMO_CHORD_NAME = "Am";

const SCALE: readonly FretMark[] = [...scaleMarks(FRETBOARD_DEMO_SPEC, FRETBOARD_DEMO_WINDOW, "note")].sort(
	(a, b) => a.fret - b.fret || a.string - b.string,
);
const OVERLAID: readonly FretMark[] = overlayChordTones(
	SCALE,
	chordTonesFromMidi(FRETBOARD_DEMO_CHORD_MIDI, scaleRootPitchClass(FRETBOARD_DEMO_SPEC.root)),
	FRETBOARD_DEMO_SPEC,
	FRETBOARD_DEMO_WINDOW,
	"note",
);

export const FRETBOARD_DEMO_KEY_CHORDS: readonly KeyChord[] = keyChords(FRETBOARD_DEMO_SPEC);

const PHASE = { reveal: [0, 0.45], chordAt: 0.5, pianoAt: 0.78 } as const;

export interface FretboardStage {
	marks: readonly FretMark[];
	/** The chord laid over the scale, once it is. */
	chord: string | null;
	/** Whether the diatonic-chord piano is showing, with the chord pressed. */
	piano: boolean;
	position: string;
}

export function fretboardStage(p: number): FretboardStage {
	const chord = p >= PHASE.chordAt;
	const revealed = Math.round(seg(p, ...PHASE.reveal) * SCALE.length);
	const marks = chord ? OVERLAID : SCALE.slice(0, revealed);
	return {
		marks,
		chord: chord ? FRETBOARD_DEMO_CHORD_NAME : null,
		piano: p >= PHASE.pianoAt,
		position: chord ? `SCALE + CHORD ${FRETBOARD_DEMO_CHORD_NAME}` : "SCALE",
	};
}
