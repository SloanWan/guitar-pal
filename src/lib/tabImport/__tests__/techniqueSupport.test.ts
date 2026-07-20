import { describe, it, expect } from "vitest";
import type { Technique } from "@/lib/fingerpickTypes";
import { TECHNIQUE_SUPPORT, isRenderSupported } from "../techniqueSupport";

// Every NonNullable<Technique> value — must stay in sync with fingerpickTypes.ts.
const ALL_TECHNIQUES: NonNullable<Technique>[] = [
	"hammer-on", "pull-off", "slide-up", "slide-down",
	"bend-full", "bend-half", "bend-quarter", "bend-release",
	"pre-bend", "pre-bend-release", "vibrato", "vibrato-wide",
	"vibrato-bar", "tapping", "trill", "harmonic-natural",
	"harmonic-artificial", "whammy-dive", "whammy-pull",
	"pick-scrape", "grace-note",
];

describe("techniqueSupport", () => {
	it("covers every NonNullable<Technique> value (registry exhaustiveness)", () => {
		for (const t of ALL_TECHNIQUES) {
			expect(TECHNIQUE_SUPPORT, `missing entry for "${t}"`).toHaveProperty(t);
		}
		expect(Object.keys(TECHNIQUE_SUPPORT)).toHaveLength(ALL_TECHNIQUES.length);
	});

	it("marks rendered techniques as renderSupported", () => {
		const rendered: NonNullable<Technique>[] = [
			"hammer-on", "pull-off", "slide-up", "slide-down",
			"vibrato", "vibrato-wide", "tapping", "trill",
		];
		for (const t of rendered) {
			expect(TECHNIQUE_SUPPORT[t].renderSupported, t).toBe(true);
			expect(isRenderSupported(t), t).toBe(true);
		}
	});

	it("marks unrendered techniques as not renderSupported", () => {
		const unrendered: NonNullable<Technique>[] = [
			"bend-full", "bend-half", "bend-quarter", "bend-release",
			"pre-bend", "pre-bend-release", "vibrato-bar",
			"harmonic-natural", "harmonic-artificial",
			"whammy-dive", "whammy-pull", "pick-scrape", "grace-note",
		];
		for (const t of unrendered) {
			expect(TECHNIQUE_SUPPORT[t].renderSupported, t).toBe(false);
			expect(isRenderSupported(t), t).toBe(false);
		}
	});

	it("marks audio-engine-handled techniques as audioSupported", () => {
		const audible: NonNullable<Technique>[] = [
			"hammer-on", "pull-off", "tapping", "trill",
		];
		for (const t of audible) {
			expect(TECHNIQUE_SUPPORT[t].audioSupported, t).toBe(true);
		}
	});

	it("marks techniques without audio engine handling as not audioSupported", () => {
		const silent: NonNullable<Technique>[] = [
			"slide-up", "slide-down", "vibrato", "vibrato-wide",
			"bend-full", "grace-note",
		];
		for (const t of silent) {
			expect(TECHNIQUE_SUPPORT[t].audioSupported, t).toBe(false);
		}
	});
});
