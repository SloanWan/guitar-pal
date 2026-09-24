import { describe, expect, it } from "vitest";

import { looksLikeChord } from "@/lib/assistant/chordSpelling";

describe("looksLikeChord", () => {
	it("reads a word spelled the way a chord is", () => {
		for (const word of ["C", "Am", "F#m7", "Bb", "Cmaj7", "Dsus4", "G/B", "Cmaj13#11"]) {
			expect(looksLikeChord(word), word).toBe(true);
		}
	});

	it("does not read an ordinary word that opens on a note letter", () => {
		for (const word of ["Give", "And", "Add", "Bed", "Ache", "", "H", "C!"]) {
			expect(looksLikeChord(word), word).toBe(false);
		}
	});

	// #287: two alternatives used to overlap what the outer `*` could match, so
	// a word that fails to match had 2^n ways to be parsed and the engine walked
	// every one. Warm medians below are before → after for the input each case
	// builds. The lengths are picked so a regression fails on the assertion:
	// shorter ones stay near the bound, longer ones run into Vitest's timeout
	// instead of reporting anything readable.
	it("answers a long digit run promptly rather than backtracking over it", () => {
		// `\d+` inside the repeated group. 26 digits: 365 ms → 0.000 ms.
		const word = `C${"1".repeat(26)}x`;
		const started = performance.now();
		expect(looksLikeChord(word)).toBe(false);
		expect(performance.now() - started).toBeLessThan(50);
	});

	it("answers a long run of slash roots promptly", () => {
		// The trailing `[#b♯♭]?` on the slash alternative, which `#` could also
		// claim on the next iteration. 26 repetitions: 1054 ms → 0.000 ms.
		const word = `A${"/A#".repeat(26)}x`;
		const started = performance.now();
		expect(looksLikeChord(word)).toBe(false);
		expect(performance.now() - started).toBeLessThan(50);
	});
});
