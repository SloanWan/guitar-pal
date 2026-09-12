import { describe, it, expect } from "vitest";
import { readPhrase, phraseIsEnough, STYLES } from "@/lib/strumAssistant/readPhrase";
import { isBrowsableSuffix } from "@/lib/chordSuffixes";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { CHORD_ROWS } from "@/lib/__fixtures__/chordData.fixture";

const INDEX: readonly ChordIndexEntry[] = CHORD_ROWS.filter((r) =>
	isBrowsableSuffix(r.suffix),
).map((r) => ({ root: r.root, suffix: r.suffix }));

const read = (input: string) => readPhrase(input, INDEX);

describe("readPhrase", () => {
	describe("reads a whole sentence", () => {
		it("takes chords, a style and a tempo out of a Chinese request", () => {
			const reading = read("给我一个 C-G-Am-F 的民谣扫弦，慢一点");
			expect(reading.chordWords).toEqual(["C", "G", "Am", "F"]);
			expect(reading.style).toBe("folk");
			expect(reading.rhythm).toBe("D DU UD");
			expect(reading.tempo).toBe("slower");
			// folk's 80, slowed by a step and rounded to five.
			expect(reading.bpm).toBe(70);
			expect(reading.leftover).toBe("");
			expect(phraseIsEnough(reading)).toBe(true);
		});

		it("takes the same out of an English one", () => {
			const reading = read("give me a slow folk strum in C G Am F");
			expect(reading.chordWords).toEqual(["C", "G", "Am", "F"]);
			expect(reading.style).toBe("folk");
			expect(reading.tempo).toBe("slower");
			expect(reading.leftover).toBe("");
		});

		it("reads chords with a tempo and no style", () => {
			const reading = read("C G Am F 慢一点");
			expect(reading.chordWords).toHaveLength(4);
			expect(reading.style).toBeNull();
			expect(reading.rhythm).toBeNull();
			// No style to start from: the default tempo, slowed.
			expect(reading.bpm).toBe(70);
			expect(phraseIsEnough(reading)).toBe(true);
		});

		it("reads a style with no chords", () => {
			const reading = read("来个摇滚节奏");
			expect(reading.chordWords).toEqual([]);
			expect(reading.style).toBe("rock");
			expect(reading.bpm).toBe(110);
			expect(phraseIsEnough(reading)).toBe(true);
		});

		it("lets a written tempo win over an adjective", () => {
			expect(read("C G Am F, slow, 92 bpm").bpm).toBe(92);
			expect(read("C G Am F 快一点 100拍").bpm).toBe(100);
		});

		it("speeds a style up as well as down", () => {
			expect(read("fast rock, C G D").bpm).toBe(125);
		});

		it("accepts every separator a chord line is written with", () => {
			for (const line of ["C-G-Am-F", "C G Am F", "C, G, Am, F", "C → G → Am → F", "C | G | Am | F"]) {
				expect(read(`${line} folk`).chordWords, line).toEqual(["C", "G", "Am", "F"]);
			}
		});

		it("names every style it knows by every word it knows", () => {
			for (const style of STYLES) {
				for (const word of style.words) {
					expect(read(`C G ${word}`).style, word).toBe(style.key);
				}
			}
		});
	});

	describe("refuses what it cannot read whole", () => {
		it("leaves a reference to a song unread", () => {
			const reading = read("像 Wonderwall 那样的 C G Am F");
			expect(reading.chordWords).toHaveLength(4);
			expect(reading.leftover).not.toBe("");
			expect(phraseIsEnough(reading)).toBe(false);
		});

		it("leaves an English word it does not know unread", () => {
			const reading = read("C G Am F but dreamy");
			expect(reading.leftover).toBe("butdreamy");
			expect(phraseIsEnough(reading)).toBe(false);
		});

		it("does not read a capitalised article as the chord A", () => {
			// "A" resolves as a chord; on its own it is not a run, and it stays unread.
			const reading = read("A slow folk strum");
			expect(reading.chordWords).toEqual([]);
			expect(reading.leftover).toBe("a");
			expect(phraseIsEnough(reading)).toBe(false);
		});

		it("does not read a word that merely starts with a note name", () => {
			expect(read("Give me Bad chords C G").chordWords).toEqual(["C", "G"]);
			expect(read("Give me Bad chords C G").leftover).toContain("bad");
		});

		it("needs two chords standing together to call it a run", () => {
			// "C" and "G" have a word between them: neither is a run.
			const reading = read("C folk G");
			expect(reading.chordWords).toEqual([]);
			expect(phraseIsEnough(reading)).toBe(false);
		});

		it("takes the longest run when there are several", () => {
			expect(read("C G, then Am F Dm").chordWords).toEqual(["Am", "F", "Dm"]);
		});

		it("leaves 'in the key of C' to the model", () => {
			// One chord is a key, not a progression; there is nothing to write.
			expect(phraseIsEnough(read("folk in the key of C"))).toBe(false);
			expect(phraseIsEnough(read("给我一个 C 调的民谣扫弦，慢一点"))).toBe(false);
		});

		it("reads two styles as a sentence rather than picking one", () => {
			expect(phraseIsEnough(read("folk rock C G Am F"))).toBe(false);
		});

		it("reads slower and faster together as neither", () => {
			const reading = read("C G Am F 快一点又慢一点");
			expect(reading.tempo).toBeNull();
		});

		it("reads nothing from nothing", () => {
			expect(phraseIsEnough(read(""))).toBe(false);
			expect(phraseIsEnough(read("给我一个扫弦"))).toBe(false);
		});
	});

	it("never throws on arbitrary input", () => {
		for (const junk of ["", "🎸", "|||", "\n\t", "0123", "'; drop table --", "C".repeat(600)]) {
			expect(() => read(junk)).not.toThrow();
		}
	});
});
