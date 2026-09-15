import { describe, it, expect } from "vitest";

import { BOX_FRETS, noteSpacingSeconds, scalePositions, scaleRun } from "@/lib/fretboard/scaleRun";
import { scalePitchClasses, scaleRootPitchClass, SCALE_TYPES, type ScaleSpec } from "@/lib/fretboard/scales";
import { slotMidi } from "@/lib/fretboard/positions";

const NECK = { fromFret: 0, toFret: 22 };
const mod12 = (n: number) => ((n % 12) + 12) % 12;

describe("scalePositions", () => {
	it("gives one box per scale degree, each five frets wide", () => {
		for (const scale of SCALE_TYPES) {
			const spec: ScaleSpec = { root: "A", scale };
			const boxes = scalePositions(spec, NECK);
			expect(boxes).toHaveLength(scalePitchClasses(spec).length);
			for (const box of boxes) expect(box.toFret - box.fromFret + 1).toBe(BOX_FRETS);
		}
		expect(scalePositions({ root: "A", scale: "minorPentatonic" }, NECK)).toHaveLength(5);
		expect(scalePositions({ root: "C", scale: "major" }, NECK)).toHaveLength(7);
	});

	it("anchors each box where a degree sits on the low E, low to high", () => {
		// A minor pentatonic is A C D E G: on the low E those are frets 5, 8, 10, 0, 3.
		expect(scalePositions({ root: "A", scale: "minorPentatonic" }, NECK)).toEqual([
			{ fromFret: 0, toFret: 4 },
			{ fromFret: 3, toFret: 7 },
			{ fromFret: 5, toFret: 9 },
			{ fromFret: 8, toFret: 12 },
			{ fromFret: 10, toFret: 14 },
		]);
	});

	it("holds every scale degree in every box, for any root", () => {
		for (const root of ["C", "E", "F#", "Bb"]) {
			for (const scale of SCALE_TYPES) {
				const spec: ScaleSpec = { root, scale };
				const wanted = new Set(scalePitchClasses(spec));
				for (const box of scalePositions(spec, NECK)) {
					const found = new Set<number>();
					for (let s = 0; s < 6; s++) {
						for (let f = box.fromFret; f <= box.toFret; f++) {
							const pc = mod12(slotMidi(s, f));
							if (wanted.has(pc)) found.add(pc);
						}
					}
					expect(found.size).toBe(wanted.size);
				}
			}
		}
	});

	it("takes a box an octave up rather than clipping it to a stub", () => {
		// Behind a capo at 6 the boxes anchored at 0, 3 and 5 reappear at 12, 15 and 17.
		expect(scalePositions({ root: "A", scale: "minorPentatonic" }, { fromFret: 6, toFret: 22 })).toEqual([
			{ fromFret: 8, toFret: 12 },
			{ fromFret: 10, toFret: 14 },
			{ fromFret: 12, toFret: 16 },
			{ fromFret: 15, toFret: 19 },
			{ fromFret: 17, toFret: 21 },
		]);
		// Nothing fits in the last three frets.
		expect(scalePositions({ root: "A", scale: "minorPentatonic" }, { fromFret: 20, toFret: 22 })).toEqual([]);
	});
});

describe("scaleRun", () => {
	const AM_PENT: ScaleSpec = { root: "A", scale: "minorPentatonic" };

	it("ascends by pitch, one slot per pitch, starting on the lowest root", () => {
		const run = scaleRun(AM_PENT, NECK, { kind: "box", box: { fromFret: 5, toFret: 9 } });
		const midis = run.map((s) => s.midi);
		expect(midis).toEqual([...midis].sort((a, b) => a - b));
		expect(new Set(midis).size).toBe(midis.length);
		expect(mod12(midis[0])).toBe(scaleRootPitchClass("A"));
		expect(run[0]).toEqual({ string: 0, fret: 5, midi: 45 }); // A2 on the low E
		for (const slot of run) expect(new Set(scalePitchClasses(AM_PENT))).toContain(mod12(slot.midi));
	});

	it("takes the lowest fret where a pitch is reachable twice", () => {
		// In the 5–9 box, E4 sits on the G string at 9 and the B string at 5.
		const run = scaleRun(AM_PENT, NECK, { kind: "box", box: { fromFret: 5, toFret: 9 } });
		const e4 = run.find((s) => s.midi === 64);
		expect(e4).toEqual({ string: 4, fret: 5, midi: 64 });
		expect(run.filter((s) => s.midi === 64)).toHaveLength(1);
	});

	it("plays everything a string has, root or not", () => {
		const run = scaleRun(AM_PENT, NECK, { kind: "string", string: 0 });
		expect(run.every((s) => s.string === 0)).toBe(true);
		// A minor pentatonic on the low E, open string included: E0 G3 A5 C8 …
		expect(run.map((s) => s.fret)).toEqual([0, 3, 5, 8, 10, 12, 15, 17, 20, 22]);
		expect(scaleRun(AM_PENT, NECK, { kind: "string", string: 9 })).toEqual([]);
	});

	it("runs the whole neck from its lowest root to its highest note", () => {
		const run = scaleRun(AM_PENT, NECK, { kind: "neck" });
		// A2, taken on the open A string rather than the low E's 5th fret —
		// the lowest fret that sounds it, which is open position.
		expect(run[0]).toEqual({ string: 1, fret: 0, midi: 45 });
		expect(run[run.length - 1].midi).toBe(slotMidi(5, 22)); // D6, the neck's top
		const midis = run.map((s) => s.midi);
		expect(midis).toEqual([...midis].sort((a, b) => a - b));
		expect(new Set(midis).size).toBe(midis.length);
		// Every pitch is taken at the lowest fret that can sound it.
		for (const slot of run) {
			for (let s = 0; s < 6; s++) {
				const fret = slot.midi - slotMidi(s, 0);
				if (fret >= 0 && fret <= 22) expect(slot.fret).toBeLessThanOrEqual(fret);
			}
		}
	});

	it("starts at the capo, not the nut", () => {
		const run = scaleRun(AM_PENT, { fromFret: 7, toFret: 22 }, { kind: "string", string: 0 });
		expect(run.map((s) => s.fret)).toEqual([8, 10, 12, 15, 17, 20, 22]);
		// The neck run's tonic moves up with the capo too: A2 is out of reach, A3 is not.
		expect(scaleRun(AM_PENT, { fromFret: 7, toFret: 22 }, { kind: "neck" })[0].midi).toBe(57);
	});

	it("falls back to the lowest scale tone when a box holds no root", () => {
		// Two frets on the low E with no A anywhere: the C is still played.
		const box = { fromFret: 8, toFret: 9 };
		const run = scaleRun(AM_PENT, { fromFret: 8, toFret: 9 }, { kind: "box", box });
		expect(run.length).toBeGreaterThan(0);
		expect(run.some((s) => mod12(s.midi) === scaleRootPitchClass("A"))).toBe(false);
		expect(run[0].midi).toBe(Math.min(...run.map((s) => s.midi)));
	});

	it("returns nothing for a box the window has moved past", () => {
		expect(scaleRun(AM_PENT, { fromFret: 12, toFret: 22 }, { kind: "box", box: { fromFret: 0, toFret: 4 } })).toEqual(
			[],
		);
	});
});

describe("noteSpacingSeconds", () => {
	it("is a beat at quarters and half of one at eighths", () => {
		expect(noteSpacingSeconds(120, "quarter")).toBeCloseTo(0.5);
		expect(noteSpacingSeconds(120, "eighth")).toBeCloseTo(0.25);
		expect(noteSpacingSeconds(90, "eighth")).toBeCloseTo(1 / 3);
	});
});
