import { describe, it, expect } from "vitest";

import { estimatePitchHz, midiToHz, centsBetween } from "@/lib/pitchEstimate";

const SR = 44100;

function sine(hz: number, seconds: number, amplitude = 0.5): Float32Array {
	const out = new Float32Array(Math.round(seconds * SR));
	for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SR);
	return out;
}

/** Sawtooth-ish plucked tone: harmonics 1..8 at 1/k, like a bright string. */
function pluck(hz: number, seconds: number): Float32Array {
	const out = new Float32Array(Math.round(seconds * SR));
	for (let i = 0; i < out.length; i++) {
		let v = 0;
		for (let k = 1; k <= 8; k++) v += Math.sin((2 * Math.PI * hz * k * i) / SR) / k;
		out[i] = 0.3 * v;
	}
	return out;
}

describe("midiToHz / centsBetween", () => {
	it("A4 is 440 and a whole tone is 200 cents", () => {
		expect(midiToHz(69)).toBe(440);
		expect(midiToHz(62)).toBeCloseTo(293.66, 2);
		expect(centsBetween(midiToHz(64), midiToHz(62))).toBeCloseTo(200, 6);
		expect(centsBetween(440, 440)).toBe(0);
	});
});

describe("estimatePitchHz", () => {
	it("finds a sine's frequency to within a cent", () => {
		for (const hz of [110, 196, 293.66, 440, 659.26]) {
			const { hz: got, clarity } = estimatePitchHz(sine(hz, 0.1), SR);
			expect(got).not.toBeNull();
			expect(Math.abs(centsBetween(got!, hz))).toBeLessThan(1);
			expect(clarity).toBeGreaterThan(0.9);
		}
	});

	it("stays on the fundamental of a harmonic-rich tone (no octave error)", () => {
		for (const hz of [146.83, 293.66, 329.63]) {
			const { hz: got } = estimatePitchHz(pluck(hz, 0.1), SR);
			expect(got).not.toBeNull();
			expect(Math.abs(centsBetween(got!, hz))).toBeLessThan(2);
		}
	});

	it("resolves a 200-cent difference between two tones", () => {
		const a = estimatePitchHz(pluck(midiToHz(62), 0.1), SR).hz!;
		const b = estimatePitchHz(pluck(midiToHz(64), 0.1), SR).hz!;
		expect(centsBetween(b, a)).toBeCloseTo(200, 0);
	});

	it("reports silence and noise as unpitched", () => {
		expect(estimatePitchHz(new Float32Array(4410), SR)).toEqual({ hz: null, clarity: 0 });
		const noise = new Float32Array(4410);
		let seed = 1;
		for (let i = 0; i < noise.length; i++) {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			noise[i] = seed / 4294967296 - 0.5;
		}
		const { hz, clarity } = estimatePitchHz(noise, SR);
		expect(hz).toBeNull();
		expect(clarity).toBeLessThan(0.5);
	});

	it("honours the frequency bounds", () => {
		const { hz } = estimatePitchHz(sine(440, 0.1), SR, { minHz: 500, maxHz: 1500 });
		// 440 is below the floor; nothing in range should be called pitched at it.
		expect(hz === null || Math.abs(centsBetween(hz, 440)) > 50).toBe(true);
	});

	it("gives up on a window too short for the lowest allowed pitch", () => {
		expect(estimatePitchHz(sine(440, 0.001), SR, { minHz: 60 }).hz).toBeNull();
	});
});
