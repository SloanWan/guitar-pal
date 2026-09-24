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

	// #287: the digit alternative used to be `\d+` inside a `*`-repeated group,
	// so a digit run had 2^(n-1) splits and a word that did not match made the
	// engine walk every one of them. Warm medians for this input: 26 digits ran
	// 365 ms that way against 0.000 ms this way, a gap of six orders of
	// magnitude, so the bound below has room on a loaded runner from either
	// side. The length is picked deliberately — 24 digits only reached 102 ms,
	// too close to the bound to catch a regression, and 28 took 1.6 s, heading
	// for Vitest's timeout instead of a readable assertion failure.
	it("answers a long digit run promptly rather than backtracking over it", () => {
		const word = `C${"1".repeat(26)}x`;
		const started = performance.now();
		expect(looksLikeChord(word)).toBe(false);
		expect(performance.now() - started).toBeLessThan(50);
	});
});
