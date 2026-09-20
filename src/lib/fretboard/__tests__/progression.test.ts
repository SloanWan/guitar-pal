// A progression is a list of intervals above the key's root; the key turns
// them into chords when it is played, so changing the key transposes every
// bar and leaves the numerals alone.
import { describe, it, expect } from "vitest";

import type { ChordVoicing } from "@/lib/chordVoicing";
import type { KeyChord } from "@/lib/fretboard/chords";
import {
	MAX_BARS,
	PROGRESSION_PRESETS,
	appendStep,
	barSeconds,
	presetSteps,
	progressionSteps,
	removeStep,
	resolveProgression,
} from "@/lib/fretboard/progression";
import { noteSteps } from "@/lib/fretboard/sequence";

function voicing(frets: string, start_fret = 1): ChordVoicing {
	return { id: frets, label: "Standard", start_fret, barre_fret: null, capo: false, frets, fingers: "000000" };
}
const LIBRARY: Record<string, ChordVoicing> = {
	"C major": voicing("x32010"),
	"G major": voicing("320003"),
	"A minor": voicing("x02210"),
	"F major": voicing("133211"),
	"Bb major": voicing("x13331"),
	"D minor": voicing("xx0231"),
};
const voicingFor = (chord: KeyChord) => LIBRARY[`${chord.root} ${chord.suffix}`] ?? null;

const C_MAJOR = { root: "C", scale: "major" } as const;

describe("progression strip", () => {
	it("appends, removes and clears", () => {
		let steps = appendStep([], 0);
		steps = appendStep(steps, 7);
		steps = appendStep(steps, 9 + 12); // wrapped into the octave
		expect(steps.map((s) => s.interval)).toEqual([0, 7, 9]);
		expect(removeStep(steps, 1).map((s) => s.interval)).toEqual([0, 9]);
		expect(removeStep(steps, 5)).toEqual(steps);
		expect(removeStep(steps, 5)).not.toBe(steps);
	});

	it("stops at the maximum length", () => {
		let steps = appendStep([], 0);
		for (let i = 0; i < MAX_BARS + 3; i++) steps = appendStep(steps, i);
		expect(steps).toHaveLength(MAX_BARS);
	});

	it("resolves a preset through the key's parent scale, so the qualities are the key's", () => {
		const pop = PROGRESSION_PRESETS[0];
		expect(pop.name).toBe("I–V–vi–IV");
		expect(presetSteps(pop, C_MAJOR).map((s) => s.interval)).toEqual([0, 7, 9, 5]);
		// Natural minor: the same degrees, a semitone lower on the VI.
		expect(presetSteps(pop, { root: "A", scale: "naturalMinor" }).map((s) => s.interval)).toEqual([0, 7, 8, 5]);
		// Pentatonic borrows its parent scale, as its chords do.
		expect(presetSteps(pop, { root: "A", scale: "minorPentatonic" }).map((s) => s.interval)).toEqual([0, 7, 8, 5]);
	});

	it("lasts four beats a bar", () => {
		expect(barSeconds(120)).toBeCloseTo(2);
		expect(barSeconds(60)).toBeCloseTo(4);
	});
});

describe("resolveProgression", () => {
	const POP = presetSteps(PROGRESSION_PRESETS[0], C_MAJOR);

	it("names each bar from the key and sounds its standard shape", () => {
		const bars = resolveProgression(POP, C_MAJOR, 0, voicingFor);
		expect(bars.map((b) => b.sounding.numeral)).toEqual(["I", "V", "vi", "IV"]);
		expect(bars.map((b) => b.sounding.root)).toEqual(["C", "G", "A", "F"]);
		expect(bars[0].voicing).toBe(LIBRARY["C major"]);
		// x32010: C3 E3 G3 C4 E4.
		expect(bars[0].midis).toEqual([48, 52, 55, 60, 64]);
		expect(bars[0].slots).toEqual([
			{ string: 1, fret: 3 },
			{ string: 2, fret: 2 },
			{ string: 3, fret: 0 },
			{ string: 4, fret: 1 },
			{ string: 5, fret: 0 },
		]);
	});

	it("transposes every bar when the key changes, and leaves the numerals alone", () => {
		const inG = resolveProgression(POP, { root: "G", scale: "major" }, 0, voicingFor);
		expect(inG.map((b) => b.sounding.numeral)).toEqual(["I", "V", "vi", "IV"]);
		expect(inG.map((b) => b.sounding.root)).toEqual(["G", "D", "E", "C"]);
	});

	it("keeps a chromatic degree's numeral across a key change", () => {
		const flatSeven = [{ interval: 10 }];
		const inC = resolveProgression(flatSeven, C_MAJOR, 0, voicingFor)[0];
		expect(inC.sounding.numeral).toBe("♭VII");
		expect(inC.sounding.root).toBe("Bb");
		const inG = resolveProgression(flatSeven, { root: "G", scale: "major" }, 0, voicingFor)[0];
		expect(inG.sounding.numeral).toBe("♭VII");
		expect(inG.sounding.root).toBe("F");
	});

	it("fingers the shape below what is heard with a capo, and sounds the heard chord", () => {
		const [bar] = resolveProgression([{ interval: 0 }], C_MAJOR, 2, voicingFor);
		expect(bar.sounding.root).toBe("C");
		expect(bar.sounding.numeral).toBe("I");
		expect(bar.shape.root).toBe("Bb");
		expect(bar.voicing).toBe(LIBRARY["Bb major"]);
		// x13331 held two frets up the neck: every pitch is a C-major tone.
		expect(bar.midis).toEqual([48, 55, 60, 64, 67]);
		expect(bar.slots.every((s) => s.fret >= 3)).toBe(true);
	});

	it("keeps a bar the library has no shape for, silent", () => {
		const bars = resolveProgression([{ interval: 0 }, { interval: 4 }], C_MAJOR, 0, voicingFor);
		expect(bars[1].sounding.numeral).toBe("iii");
		expect(bars[1].voicing).toBeNull();
		expect(bars[1].midis).toEqual([]);
		expect(bars[1].slots).toEqual([]);
		expect(progressionSteps(bars)).toHaveLength(2);
		expect(progressionSteps(bars)[0].midis).toEqual(bars[0].midis);
	});
});

describe("noteSteps", () => {
	it("makes a step per note, each lighting its own slot", () => {
		expect(noteSteps([{ string: 0, fret: 5, midi: 45 }])).toEqual([{ midis: [45], slots: [{ string: 0, fret: 5 }] }]);
	});
});
