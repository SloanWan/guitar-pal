import { describe, it, expect } from "vitest";
import { readTabSentence } from "@/lib/assistant/tab/readTabSentence";
import { INDEX } from "./fixtures";

const read = (text: string) => readTabSentence(text, INDEX);
const chordTexts = (r: ReturnType<typeof read>) => r.chordWords.map((w) => w.text);

describe("readTabSentence", () => {
	describe("chord + pick order", () => {
		it("reads a chord, a colon and an order", () => {
			const r = read("Am: 5 3 2 1 3 2 1 3");
			expect(chordTexts(r)).toEqual(["Am"]);
			expect(r.chordWords[0].chord).toEqual({ root: "A", suffix: "minor", voicingId: null });
			expect(r.orderText).toBe("5 3 2 1 3 2 1 3");
			expect(r.order).toHaveLength(8);
			expect(r.leftover).toBe("");
		});

		it("does without the colon", () => {
			const r = read("C 6 3 2 3 1 3 2 3");
			expect(chordTexts(r)).toEqual(["C"]);
			expect(r.order).toHaveLength(8);
			expect(r.leftover).toBe("");
		});

		it("reads several chords for one order", () => {
			const r = read("C G Am F: 5 3 2 1");
			expect(chordTexts(r)).toEqual(["C", "G", "Am", "F"]);
			expect(r.order).toHaveLength(4);
		});

		it("reads a root order over several chords, in either language", () => {
			const r = read("C G Am F: 根3231323");
			expect(chordTexts(r)).toEqual(["C", "G", "Am", "F"]);
			expect(r.orderText).toBe("根3231323");
			expect(r.order).toHaveLength(8);
			expect(r.order?.[0]).toEqual({ strings: [], root: true });
			expect(r.leftover).toBe("");

			const zh = read("给我一个 G D Em C 的分解，根3（12）3");
			expect(chordTexts(zh)).toEqual(["G", "D", "Em", "C"]);
			expect(zh.order).toHaveLength(4);
			expect(zh.leftover).toBe("");

			const latin = read("Am R 3 2 3 1 3 2 3");
			expect(chordTexts(latin)).toEqual(["Am"]);
			expect(latin.order).toHaveLength(8);
			expect(latin.leftover).toBe("");
		});

		it("reads lone lowercase chord letters, and a lone 'a' only before a colon", () => {
			expect(chordTexts(read("c g am f: R3231323"))).toEqual(["c", "g", "am", "f"]);
			expect(read("c g am f: R3231323").leftover).toBe("");
			expect(chordTexts(read("a: 5 3 2 1"))).toEqual(["a"]);
			// An article stays one: nothing else in this sentence is a chord.
			expect(chordTexts(read("give me a pattern"))).toEqual([]);
		});

		it("reads an alternating bass and a meter in one sentence", () => {
			const r = read("C G Am F: 5/4 2 1 3 in 3/4");
			expect(r.orderText).toBe("5/4 2 1 3");
			expect(r.order).toHaveLength(8);
			expect(r.timeSignature).toEqual([3, 4]);
			expect(r.leftover).toBe("");
		});

		it("reads a note value, spaced or glued", () => {
			expect(read("Am: 5321 /16").duration).toBe("sixteenth");
			expect(read("Am: 5321/16").duration).toBe("sixteenth");
			expect(read("Am: 5321/16").orderText).toBe("5321");
			expect(read("Am 5 3 2 1 in eighths").duration).toBe("eighth");
			expect(read("Am 5 3 2 1 十六分音符").duration).toBe("sixteenth");
		});

		it("tells 6/8 from an order that ends in 6", () => {
			const r = read("Am: 5 3 2 1 3 6 6/8");
			expect(r.timeSignature).toEqual([6, 8]);
			expect(r.orderText).toBe("5 3 2 1 3 6");
			expect(r.leftover).toBe("");
		});

		it("reads a Chinese meter word", () => {
			expect(read("Am 5 3 2 1 三拍子").timeSignature).toEqual([3, 4]);
			expect(read("Am 5 3 2 1 六八拍").timeSignature).toEqual([6, 8]);
		});

		it("keeps an unknown chord word in its place rather than dropping it", () => {
			const r = read("Cmaj13#11 G: 5 3 2 1");
			expect(chordTexts(r)).toEqual(["Cmaj13#11", "G"]);
			expect(r.chordWords[0].chord).toBeNull();
			expect(r.chordWords[1].chord).not.toBeNull();
			expect(r.leftover).toBe("");
		});

		it("does not take a capitalised word for a chord", () => {
			const r = read("Give me Am: 5 3 2 1");
			expect(chordTexts(r)).toEqual(["Am"]);
			expect(r.leftover).toBe("");
			expect(read("Bad travis in Am").chordWords.map((w) => w.text)).toEqual(["Am"]);
		});

		it("does not read a lone digit as an order", () => {
			const r = read("Am 5");
			expect(r.order).toBeNull();
			expect(r.leftover).toBe("5");
		});
	});

	describe("style + chord", () => {
		it("reads a style word in English", () => {
			const r = read("travis picking in Am");
			expect(r.style?.key).toBe("travis");
			expect(chordTexts(r)).toEqual(["Am"]);
			expect(r.leftover).toBe("");
		});

		it("reads a style word in Chinese, no spaces needed", () => {
			const r = read("Am三指法");
			expect(r.style?.key).toBe("travis");
			expect(chordTexts(r)).toEqual(["Am"]);
			expect(r.leftover).toBe("");
		});

		it("reads a request's noise around the style", () => {
			const r = read("give me a travis in Am at 90 bpm");
			expect(r.style?.key).toBe("travis");
			expect(chordTexts(r)).toEqual(["Am"]);
			expect(r.bpm).toBe(90);
			expect(r.leftover).toBe("");
		});

		it("reads waltz and arpeggio", () => {
			expect(read("waltz in G").style?.key).toBe("waltz");
			expect(read("Em 分解和弦").style?.key).toBe("arpeggio");
		});
	});

	describe("the readers shared with strum", () => {
		it("reads a name, a capo and a tempo", () => {
			const r = read("Am 5 3 2 1 3 2 1 3, name it my arp, capo 2, 72 bpm");
			expect(r.name).toBe("my arp");
			expect(r.capo).toBe(2);
			expect(r.bpm).toBe(72);
			expect(r.leftover).toBe("");
		});
	});

	describe("what it does not read", () => {
		it("leaves a sentence with no musical content unread", () => {
			expect(read("what is a good song to learn").leftover).not.toBe("");
		});

		it("does not take strum notation for chords", () => {
			expect(read("D DU UD").leftover).not.toBe("");
		});

		it("reads a bare chord line whole", () => {
			const r = read("C G Am F");
			expect(chordTexts(r)).toEqual(["C", "G", "Am", "F"]);
			expect(r.order).toBeNull();
			expect(r.style).toBeNull();
			expect(r.leftover).toBe("");
		});
	});
});
