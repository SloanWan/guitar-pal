import { describe, it, expect } from "vitest";
import { chordParam, MAX_CHORDS_PER_REQUEST, parseVoicingsQuery, voicingsFromLibrary } from "@/lib/chordVoicingsApi";
import type { ChordVoicing } from "@/lib/chordVoicing";
import type { ChordWithVoicings } from "@/lib/chordsData";

const shape = (id: string, note?: string): ChordVoicing => ({
	id,
	label: null,
	start_fret: 1,
	barre_fret: null,
	capo: false,
	frets: "x32010",
	fingers: "032010",
	...(note ? { note } : {}),
});

const query = (...chords: string[]) => new URLSearchParams(chords.map((c) => ["c", c]));

describe("parseVoicingsQuery", () => {
	it("reads each chord, keeps a slash in the suffix, and drops repeats", () => {
		expect(parseVoicingsQuery(query("C:major", "A:m/E", "C:major", "F#:m7b5"))).toEqual([
			{ root: "C", suffix: "major" },
			{ root: "A", suffix: "m/E" },
			{ root: "F#", suffix: "m7b5" },
		]);
	});

	it("round-trips what the browser writes", () => {
		const chords = [{ root: "Bb", suffix: "7sus4" }, { root: "E", suffix: "/G#" }];
		expect(parseVoicingsQuery(new URLSearchParams(chords.map((c) => ["c", chordParam(c)])))).toEqual(chords);
	});

	it("refuses an empty ask, too many chords, and anything that is not root:suffix", () => {
		expect(parseVoicingsQuery(new URLSearchParams())).toBeNull();
		const many = Array.from({ length: MAX_CHORDS_PER_REQUEST + 1 }, (_, i) => `C:s${i}`);
		expect(parseVoicingsQuery(query(...many))).toBeNull();
		expect(parseVoicingsQuery(query("Cmajor"))).toBeNull();
		expect(parseVoicingsQuery(query("H:major"))).toBeNull();
		expect(parseVoicingsQuery(query("C:"))).toBeNull();
		expect(parseVoicingsQuery(query(`C:${"x".repeat(25)}`))).toBeNull();
	});
});

describe("voicingsFromLibrary", () => {
	const library: ChordWithVoicings[] = [
		{ id: "1", root: "C", suffix: "major", chord_voicings: [shape("c1", "Hand-written"), shape("c2")] },
		{ id: "2", root: "A", suffix: "minor", chord_voicings: [shape("am1")] },
	];

	it("answers each chord in the library's order, without the chord page's note", () => {
		const { voicings } = voicingsFromLibrary(library, [{ root: "C", suffix: "major" }]);
		expect(voicings).toEqual({ "C major": [shape("c1"), shape("c2")] });
		expect(voicings["C major"][0]).not.toHaveProperty("note");
	});

	it("answers a chord the library lacks with an empty list", () => {
		const { voicings } = voicingsFromLibrary(library, [{ root: "A", suffix: "minor" }, { root: "G", suffix: "add11" }]);
		expect(voicings).toEqual({ "A minor": [shape("am1")], "G add11": [] });
	});
});
