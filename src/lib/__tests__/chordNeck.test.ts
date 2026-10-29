import { describe, expect, it } from "vitest";
import { chordTones } from "@/lib/chordFormulas";
import {
	NECK_FRETS,
	fretNoteX,
	fretWireX,
	neckDots,
	neckTones,
	shapeBox,
	shapeCentreX,
	spreadMarkers,
	stringY,
} from "@/lib/chordNeck";

const OPEN_C = [-1, 3, 2, 0, 1, 0];
const C = chordTones("C", "major")!;

describe("neckTones", () => {
	it("labels the chord's tones by degree, root first", () => {
		expect(neckTones(0, C, OPEN_C)).toEqual([
			{ pc: 0, label: "1", root: true },
			{ pc: 4, label: "3", root: false },
			{ pc: 7, label: "5", root: false },
		]);
	});

	it("adds a note the formula does not name, by its name — a slash chord's bass", () => {
		// C/E with the E on the low string is still all chord tones; C/F♯ is not.
		const tones = neckTones(0, C, [2, 3, 2, 0, 1, 0]);
		expect(tones.at(-1)).toEqual({ pc: 6, label: "F♯", root: false });
	});

	it("falls back to the shape's notes without a formula", () => {
		expect(neckTones(0, null, OPEN_C).map((t) => t.label)).toEqual(["C", "E", "G"]);
	});
});

describe("neckDots", () => {
	const dots = neckDots(neckTones(0, C, OPEN_C), OPEN_C);

	it("marks every C, E and G up to the 15th fret", () => {
		const lowE = dots.filter((d) => d.string === 0).map((d) => d.fret);
		expect(lowE).toEqual([0, 3, 8, 12, 15]);
		expect(dots.every((d) => d.fret <= NECK_FRETS)).toBe(true);
	});

	it("says which dots the shape holds", () => {
		const held = dots.filter((d) => d.held).map((d) => [d.string, d.fret]);
		expect(held).toEqual([
			[1, 3],
			[2, 2],
			[3, 0],
			[4, 1],
			[5, 0],
		]);
		expect(dots.find((d) => d.string === 1 && d.fret === 3)?.root).toBe(true);
	});
});

describe("geometry", () => {
	it("draws the high e on top and the frets left to right", () => {
		expect(stringY(5)).toBeLessThan(stringY(0));
		expect(fretNoteX(0)).toBeLessThan(fretWireX(0));
		expect(fretNoteX(1)).toBeGreaterThan(fretWireX(0));
		expect(fretNoteX(1)).toBeLessThan(fretWireX(1));
		expect(fretWireX(NECK_FRETS)).toBeLessThan(100);
	});

	it("boxes a shape from its lowest to its highest fret", () => {
		const open = shapeBox(OPEN_C);
		expect(open.left).toBeLessThan(fretWireX(0));
		expect(open.left + open.width).toBeCloseTo(fretWireX(3) - 0.4);
		const barre = shapeBox([8, 10, 10, 9, 8, 8]);
		expect(barre.left).toBeCloseTo(fretWireX(7) + 0.4);
		expect(barre.left + barre.width).toBeCloseTo(fretWireX(10) - 0.4);
	});

	it("puts a shape's marker in the middle of its fretted notes", () => {
		expect(shapeCentreX([8, 10, 10, 9, 8, 8])).toBeCloseTo(fretNoteX(9));
		expect(shapeCentreX([0, 0, 0, 0, 0, 0])).toBeCloseTo(fretNoteX(1));
	});
});

describe("spreadMarkers", () => {
	it("leaves markers that are apart where they are", () => {
		expect(spreadMarkers([10, 40, 70], 5)).toEqual([10, 40, 70]);
	});

	it("moves a marker off one in the same place, keeping the input order", () => {
		expect(spreadMarkers([40, 10, 40], 5)).toEqual([40, 10, 45]);
	});

	it("slides a run pushed past the end back inside", () => {
		const out = spreadMarkers([96, 96, 96], 5);
		expect(Math.max(...out)).toBeLessThanOrEqual(97.5);
		expect(out[1] - out[0]).toBeCloseTo(5);
		expect(out[2] - out[1]).toBeCloseTo(5);
	});
});
