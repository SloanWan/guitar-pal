import { describe, it, expect } from "vitest";
import { exactChord, readChordAsk } from "@/lib/assistant/chordAsk";
import { isBrowsableSuffix } from "@/lib/chordSuffixes";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { CHORD_ROWS } from "@/lib/__fixtures__/chordData.fixture";

const INDEX: readonly ChordIndexEntry[] = CHORD_ROWS.filter((r) => isBrowsableSuffix(r.suffix)).map((r) => ({
	root: r.root,
	suffix: r.suffix,
}));

const ask = (text: string) => readChordAsk(text, INDEX);

describe("exactChord", () => {
	it("matches a chord the library holds, whatever its spelling", () => {
		expect(exactChord("F#m7", INDEX)).toEqual({ root: "F#", suffix: "m7", voicingId: null });
		expect(exactChord("f#m7", INDEX)).toEqual({ root: "F#", suffix: "m7", voicingId: null });
		expect(exactChord("Cmaj7", INDEX)).toMatchObject({ root: "C", suffix: "maj7" });
		expect(exactChord("D#", INDEX)).toMatchObject({ root: "Eb", suffix: "major" });
		expect(exactChord("Am", INDEX)).toMatchObject({ root: "A", suffix: "minor" });
		expect(exactChord("C/G", INDEX)).toMatchObject({ root: "C", suffix: "/G" });
	});

	it("never takes the nearest chord for an English word", () => {
		// The ranked search would hand back F, D and C for these.
		expect(exactChord("for", INDEX)).toBeNull();
		expect(exactChord("do", INDEX)).toBeNull();
		expect(exactChord("chord", INDEX)).toBeNull();
		expect(exactChord("capo", INDEX)).toBeNull();
		expect(exactChord("how", INDEX)).toBeNull();
	});
});

describe("readChordAsk", () => {
	it("reads an English question with the chord after the asking phrase", () => {
		expect(ask("how do I play F#m7?")?.chords[0]).toMatchObject({ root: "F#", suffix: "m7" });
		expect(ask("How to play an F chord")?.chords[0]).toMatchObject({ root: "F", suffix: "major" });
		expect(ask("show me Bm")?.chords[0]).toMatchObject({ root: "B", suffix: "minor" });
		expect(ask("Show me the Cmaj7 chord shape")?.chords[0]).toMatchObject({ root: "C", suffix: "maj7" });
		expect(ask("what's the fingering for G/B")?.chords[0]).toMatchObject({ root: "G", suffix: "/B" });
		expect(ask("fingering for Am")?.chords[0]).toMatchObject({ root: "A", suffix: "minor" });
		expect(ask("what is a Dsus4")?.chords[0]).toMatchObject({ root: "D", suffix: "sus4" });
		expect(ask("where do my fingers go for E7")?.chords[0]).toMatchObject({ root: "E", suffix: "7" });
	});

	it("reads an English chord with a noun after it", () => {
		expect(ask("F chord")?.chords[0]).toMatchObject({ root: "F", suffix: "major" });
		expect(ask("Bm fingering")?.chords[0]).toMatchObject({ root: "B", suffix: "minor" });
		expect(ask("the C/G chord shape")?.chords[0]).toMatchObject({ root: "C", suffix: "/G" });
		expect(ask("Am7 voicings?")?.chords[0]).toMatchObject({ root: "A", suffix: "m7" });
	});

	it("reads a Chinese question", () => {
		expect(ask("C和弦怎么按")?.chords[0]).toMatchObject({ root: "C", suffix: "major" });
		expect(ask("F#m7 和弦怎么弹？")?.chords[0]).toMatchObject({ root: "F#", suffix: "m7" });
		expect(ask("Bm 的指法")?.chords[0]).toMatchObject({ root: "B", suffix: "minor" });
		expect(ask("Am的手型")?.chords[0]).toMatchObject({ root: "A", suffix: "minor" });
		expect(ask("怎么按 G")?.chords[0]).toMatchObject({ root: "G", suffix: "major" });
		expect(ask("请问 Cmaj7 怎么弹呢")?.chords[0]).toMatchObject({ root: "C", suffix: "maj7" });
		expect(ask("看看 Dm7")?.chords[0]).toMatchObject({ root: "D", suffix: "m7" });
		expect(ask("给我看 E 和弦")?.chords[0]).toMatchObject({ root: "E", suffix: "major" });
		expect(ask("Bb和弦")?.chords[0]).toMatchObject({ root: "Bb", suffix: "major" });
	});

	it("keeps the words the player wrote", () => {
		expect(ask("how do I play f#m7")?.words).toEqual(["f#m7"]);
	});

	it("reads a run of chords, in the order written", () => {
		expect(ask("show me C Am F G")?.chords.map((c) => c.root)).toEqual(["C", "A", "F", "G"]);
		expect(ask("how do I play C, G, Am and F")).toBeNull(); // "and" is a word, not a chord
		expect(ask("how do I play C, G, Am, F")?.chords).toHaveLength(4);
		expect(ask("C G Am F chord shapes")?.chords).toHaveLength(4);
		expect(ask("what are the shapes for Em D C")?.chords.map((c) => c.root)).toEqual(["E", "D", "C"]);
		expect(ask("C G Am F 的指法")?.chords).toHaveLength(4);
		expect(ask("看看 C-G-Am-F")?.chords).toHaveLength(4);
		expect(ask("这几个和弦怎么按 C G Am")).toBeNull();
		expect(ask("怎么按 C G Am 这几个和弦")?.chords).toHaveLength(3);
	});

	it("reads nothing of a run with a word the library has no chord for", () => {
		expect(ask("show me C Zm F")).toBeNull();
		expect(ask("show me C for G")).toBeNull();
	});

	it("reads nothing of a chord line, a rhythm, an edit or a bare chord", () => {
		expect(ask("C Am F G")).toBeNull();
		expect(ask("C")).toBeNull();
		expect(ask("D DU UD")).toBeNull();
		expect(ask("add C G to belief")).toBeNull();
		expect(ask("play C G Am F")).toBeNull();
		expect(ask("play F")).toBeNull();
		expect(ask("Am: 5 3 2 1")).toBeNull();
		expect(ask("a slow folk strum in C G Am F")).toBeNull();
		expect(ask("给我一个 C-G-Am-F 的民谣扫弦")).toBeNull();
	});

	it("reads nothing when the word is not a chord the library holds", () => {
		expect(ask("how do I play a capo")).toBeNull();
		expect(ask("show me for")).toBeNull();
		expect(ask("what is a chord")).toBeNull();
		expect(ask("how do I play Hm7")).toBeNull();
	});
});
