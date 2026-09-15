/**
 * Playing a scale: where the hand sits, and what it plays in what order.
 *
 * Two pure questions, both answered here. **Positions**: the boxes a scale
 * falls into, each five frets wide — the span a hand covers without shifting —
 * anchored where each scale degree sits on the low E. A five-fret window
 * across six strings always contains every pitch class, so every box holds the
 * whole scale; the boxes differ in which degree they start on, which is what
 * makes them worth learning separately.
 *
 * **Runs**: the notes to sound, ascending. A pitch reachable in two places is
 * played at the **lowest fret**, and on the lower string if two frets tie —
 * that is where a hand goes. (The issue first proposed preferring the lower
 * string outright; on the one place it matters, the G/B crossover inside a
 * box, that picks a note standard fingerings skip. Lowest fret picks the one
 * players actually use.) A box or neck run starts on its lowest root, so the
 * scale is heard from its tonic rather than from whatever note the box begins
 * on; a single string plays everything it has, because that run is a drill on
 * the string, and behind a capo trimming to the root would leave almost
 * nothing.
 *
 * Nothing here knows about audio or the DOM: the player schedules this list.
 */
import { slotMidi, type SlotNote } from "./positions";
import { scalePitchClasses, scaleRootPitchClass, type ScaleSpec } from "./scales";
import { STRING_COUNT, type FretWindow } from "./types";

import { GUITAR_OPEN_MIDI } from "@/lib/chordVoicingToMidi";

/** The span a hand covers without shifting, in frets. */
export const BOX_FRETS = 5;

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** Where the run's notes come from. */
export type RunTarget =
	| { kind: "neck" }
	| { kind: "box"; box: FretWindow }
	/** 0..5, low E to high e. */
	| { kind: "string"; string: number };

/** Overlap `a` with `b`, or null when they do not meet. */
function intersect(a: FretWindow, b: FretWindow): FretWindow | null {
	const fromFret = Math.max(a.fromFret, b.fromFret);
	const toFret = Math.min(a.toFret, b.toFret);
	return fromFret <= toFret ? { fromFret, toFret } : null;
}

/**
 * The scale's boxes inside `window`, low to high: one per scale degree, each a
 * full five frets. A degree's anchor repeats every octave, so a box the window
 * starts above (behind a capo) is taken twelve frets higher rather than
 * clipped to a stub — a hand position is five frets or it is not one. A box
 * with no octave left inside the window is left out.
 */
export function scalePositions(spec: ScaleSpec, window: FretWindow): FretWindow[] {
	const boxes: FretWindow[] = [];
	const seen = new Set<number>();
	for (const pc of scalePitchClasses(spec)) {
		const base = mod12(pc - GUITAR_OPEN_MIDI[0]);
		if (seen.has(base)) continue;
		seen.add(base);
		let fromFret = base;
		while (fromFret < window.fromFret) fromFret += 12;
		const toFret = fromFret + BOX_FRETS - 1;
		if (toFret <= window.toFret) boxes.push({ fromFret, toFret });
	}
	return boxes.sort((a, b) => a.fromFret - b.fromFret);
}

/**
 * The notes of a run, ascending by pitch, one slot per pitch, starting on the
 * lowest root. `window` is what the board can play — pass `{ fromFret: capo }`
 * and a capo shortens every run with it.
 */
export function scaleRun(spec: ScaleSpec, window: FretWindow, target: RunTarget): SlotNote[] {
	const inScale = new Set(scalePitchClasses(spec));
	const rootPc = scaleRootPitchClass(spec.root);
	const frets = target.kind === "box" ? intersect(target.box, window) : window;
	if (!frets) return [];
	const strings =
		target.kind === "string"
			? target.string >= 0 && target.string < STRING_COUNT
				? [target.string]
				: []
			: Array.from({ length: STRING_COUNT }, (_, s) => s);

	const candidates: SlotNote[] = [];
	for (const string of strings) {
		for (let fret = frets.fromFret; fret <= frets.toFret; fret++) {
			const midi = slotMidi(string, fret);
			if (inScale.has(mod12(midi))) candidates.push({ string, fret, midi });
		}
	}

	// Lowest fret first, then the lower string: where a hand actually goes.
	candidates.sort((a, b) => a.midi - b.midi || a.fret - b.fret || a.string - b.string);
	const oncePerPitch: SlotNote[] = [];
	for (const slot of candidates) {
		if (oncePerPitch[oncePerPitch.length - 1]?.midi !== slot.midi) oncePerPitch.push(slot);
	}

	// A string drill plays all it has; a scale is heard from its tonic.
	if (target.kind === "string") return oncePerPitch;
	const firstRoot = oncePerPitch.findIndex((slot) => mod12(slot.midi) === rootPc);
	return firstRoot === -1 ? oncePerPitch : oncePerPitch.slice(firstRoot);
}

/** Seconds between notes at this tempo. */
export function noteSpacingSeconds(bpm: number, division: "quarter" | "eighth"): number {
	return 60 / bpm / (division === "eighth" ? 2 : 1);
}
