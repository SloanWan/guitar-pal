import { describe, it, expect } from "vitest";
import { buildRootSections } from "@/lib/chordBrowseSections";
import type { ChordVoicing } from "@/lib/chordVoicing";

const shape = (id: string, label: string | null = "Standard"): ChordVoicing => ({
	id,
	label,
	start_fret: 1,
	barre_fret: null,
	capo: false,
	frets: "x32010",
	fingers: "032010",
});
const chord = (suffix: string, voicings = [shape(suffix)]) => ({ root: "C", suffix, chord_voicings: voicings });

describe("buildRootSections", () => {
	it("groups a root's chords by quality in taxonomy order, slash chords last", () => {
		const sections = buildRootSections([chord("/E"), chord("m7"), chord("maj7"), chord("major"), chord("minor")]);
		expect(sections.map((s) => s.label)).toEqual(["Major", "Minor", "Slash Chords"]);
		expect(sections[0].cards.map((c) => c.suffix)).toEqual(["major", "maj7"]);
	});

	it("draws each chord on its standard shape and leaves out a chord with none", () => {
		const sections = buildRootSections([chord("major", [shape("v2", "Variation 2"), shape("std")]), chord("minor", [])]);
		expect(sections).toHaveLength(1);
		expect(sections[0].cards[0].def.frets).toEqual([-1, 3, 2, 0, 1, 0]);
	});
});
