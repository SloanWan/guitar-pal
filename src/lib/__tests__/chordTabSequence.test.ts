import { describe, it, expect } from "vitest";
import {
	formatTabSequence,
	parseTabSequence,
	tabSequenceToShape,
	windowStartFret,
} from "@/lib/chordTabSequence";
import { MUTED, validateChordShape } from "@/lib/chordShape";

describe("parseTabSequence — a shape read off a tab", () => {
	it("reads a compact sequence first string first, storing it low E first", () => {
		// Em7/A: 00750x on the tab, x05700 the way every shape in the app is written.
		expect(parseTabSequence("00750x").frets).toEqual([MUTED, 0, 5, 7, 0, 0]);
	});

	it("reads a muted string either case", () => {
		expect(parseTabSequence("X0230X").frets).toEqual([MUTED, 0, 3, 2, 0, MUTED]);
	});

	it("accepts a separated sequence, which is the only way past the ninth fret", () => {
		expect(parseTabSequence("x 12 12 12 10 x").frets).toEqual([MUTED, 10, 12, 12, 12, MUTED]);
		expect(parseTabSequence("0-1-0-2-2-0").frets).toEqual([0, 2, 2, 0, 1, 0]);
	});

	it("reads an untyped field as nothing to say, not as an error", () => {
		expect(parseTabSequence("   ")).toEqual({ frets: null, error: null });
	});

	it("says so when the wrong number of strings is written", () => {
		expect(parseTabSequence("0075").error).toMatch(/six strings/i);
		expect(parseTabSequence("0 0 7 5 0 x 3").error).toMatch(/six strings/i);
	});

	it("rejects a token that is not a fret", () => {
		expect(parseTabSequence("0 0 7 5 0 q").error).toMatch(/not a fret/);
		expect(parseTabSequence("0 0 7 5 0 40").error).toMatch(/not a fret/);
	});

	it("rejects a sequence that sounds nothing", () => {
		expect(parseTabSequence("xxxxxx").error).toMatch(/sound something/);
	});
});

describe("windowStartFret", () => {
	it("sits against the nut while everything fits there", () => {
		expect(windowStartFret([MUTED, 3, 2, 0, 1, 0])).toBe(1);
	});

	it("moves up to the lowest fretted note once it does not", () => {
		expect(windowStartFret([MUTED, 0, 5, 7, 0, 0])).toBe(5);
	});

	it("ignores open strings, which sound whatever the window is", () => {
		expect(windowStartFret([0, 0, 7, 9, 0, 0])).toBe(7);
	});

	it("puts an all-open shape against the nut", () => {
		expect(windowStartFret([0, 0, 0, 0, 0, 0])).toBe(1);
	});
});

describe("tabSequenceToShape", () => {
	it("draws a high shape in a window that holds it", () => {
		const shape = tabSequenceToShape(parseTabSequence("00750x").frets!);
		expect(shape.startFret).toBe(5);
		expect(validateChordShape(shape).ok).toBe(true);
	});

	it("suggests a fingering rather than leaving the hand blank", () => {
		const shape = tabSequenceToShape(parseTabSequence("010230").frets!);
		expect(shape.fingers.some((f) => f > 0)).toBe(true);
	});

	it("hands back a shape too wide to draw, rather than silently trimming it", () => {
		// A ninth-fret note under an open-position grip: real to type, impossible
		// to draw in one window, and worth being told about.
		const shape = tabSequenceToShape(parseTabSequence("900021").frets!);
		expect(validateChordShape(shape).ok).toBe(false);
	});

	it("copies the frets, so editing the shape cannot rewrite the parse", () => {
		const frets = parseTabSequence("00750x").frets!;
		tabSequenceToShape(frets).frets[0] = 3;
		expect(frets[0]).toBe(MUTED);
	});
});

describe("formatTabSequence — round trip", () => {
	it("writes a shape back the way it was typed", () => {
		expect(formatTabSequence(parseTabSequence("00750x").frets!)).toBe("00750x");
		expect(formatTabSequence(parseTabSequence("x32010").frets!)).toBe("x32010");
	});

	it("spaces a sequence out once a fret needs two digits", () => {
		expect(formatTabSequence(parseTabSequence("x 12 12 12 10 x").frets!)).toBe(
			"x 12 12 12 10 x",
		);
	});
});
