import { describe, it, expect } from "vitest";
import { routeAssistantInput } from "@/lib/strumAssistant/router";
import { isBrowsableSuffix } from "@/lib/chordSuffixes";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { CHORD_ROWS } from "@/lib/__fixtures__/chordData.fixture";

// The same index the chord palette is given.
const INDEX: readonly ChordIndexEntry[] = CHORD_ROWS.filter((r) =>
	isBrowsableSuffix(r.suffix),
).map((r) => ({ root: r.root, suffix: r.suffix }));

const route = (input: string) => routeAssistantInput(input, INDEX);

describe("routeAssistantInput", () => {
	describe("resolves without the model", () => {
		it("reads a plain chord line", () => {
			const result = route("C Am F G");
			expect(result.path).toBe("chords");
			if (result.path !== "chords") return;
			expect(result.chordWords).toEqual(["C", "Am", "F", "G"]);
		});

		it("reads a bare rhythm", () => {
			const result = route("DUDUDU");
			expect(result.path).toBe("rhythm");
			if (result.path !== "rhythm") return;
			expect(result.rhythm).toBe("DUDUDU");
			expect(result.chordWords).toEqual([]);
		});

		it("reads chords and a rhythm written together", () => {
			const result = route("C Am F G, DUDUDU");
			expect(result.path).toBe("rhythm");
			if (result.path !== "rhythm") return;
			expect(result.chordWords).toEqual(["C", "Am", "F", "G"]);
			expect(result.rhythm).toBe("DUDUDU");
		});

		it("accepts either order", () => {
			const a = route("DUDUDU, C G");
			const b = route("C G, DUDUDU");
			expect(a).toEqual(b);
		});

		it("splits on Chinese punctuation too", () => {
			const result = route("C G Am F，下上下上");
			expect(result.path).toBe("rhythm");
			if (result.path !== "rhythm") return;
			expect(result.chordWords).toEqual(["C", "G", "Am", "F"]);
		});

		it("reads notation containing blank cells", () => {
			const result = route("D DU UD");
			expect(result.path).toBe("rhythm");
			if (result.path !== "rhythm") return;
			expect(result.rhythm).toBe("D DU UD");
		});
	});

	describe("ambiguity between a chord and a stroke", () => {
		it("treats a lone D as the chord, not a downstroke", () => {
			// Both readings parse; chords win, because someone typing one letter in a
			// chord app means the chord far more often than a one-stroke bar.
			const result = route("D");
			expect(result.path).toBe("chords");
		});

		it("still reads DU as rhythm, since no chord matches it", () => {
			expect(route("DUDU").path).toBe("rhythm");
		});

		it("keeps a chord line of single letters as chords", () => {
			const result = route("C G D A");
			expect(result.path).toBe("chords");
			if (result.path !== "chords") return;
			expect(result.chordWords).toEqual(["C", "G", "D", "A"]);
		});
	});

	describe("reads a sentence by the lexicon", () => {
		it("takes the Chinese request the model used to get", () => {
			const result = route("给我一个 C-G-Am-F 的民谣扫弦，慢一点");
			expect(result.path).toBe("phrase");
			if (result.path !== "phrase") return;
			expect(result.chordWords).toEqual(["C", "G", "Am", "F"]);
			expect(result.style).toBe("folk");
			expect(result.rhythm).toBe("D DU UD");
			expect(result.bpm).toBe(70);
		});

		it("takes an English one", () => {
			expect(route("a slow folk strum in C G Am F").path).toBe("phrase");
		});

		it("leaves the strict paths as they were", () => {
			// A line the strict reading accepts never reaches the lexicon.
			expect(route("C Am F G").path).toBe("chords");
			expect(route("C-G-Am-F").path).toBe("chords");
			expect(route("C Am F G, DUDUDU").path).toBe("rhythm");
		});

		it("still hands a sentence with an unread word to the model", () => {
			expect(route("像 Wonderwall 那样的 C G Am F").path).toBe("llm");
			expect(route("C G Am F but dreamy").path).toBe("llm");
		});
	});

	describe("hands over to the model", () => {
		it("on free-form prose", () => {
			const result = route("give me something folky and slow in C");
			expect(result.path).toBe("llm");
			if (result.path !== "llm") return;
			expect(result.reason).toBe("unrecognised-segment");
		});

		it("on Chinese prose", () => {
			expect(route("给我一个 C 调的民谣扫弦，慢一点").path).toBe("llm");
		});

		it("on empty input", () => {
			const result = route("   ");
			expect(result.path).toBe("llm");
			if (result.path !== "llm") return;
			expect(result.reason).toBe("empty");
		});

		it("on a multi-segment phrase, which is not a single pattern", () => {
			const result = route("DUDU, UDUD");
			expect(result.path).toBe("llm");
			if (result.path !== "llm") return;
			expect(result.reason).toBe("multiple-rhythms");
		});

		it("when one chord in the line is unknown", () => {
			expect(route("C Am Zq F").path).toBe("llm");
		});

		it("when the chord index has not loaded yet", () => {
			// Better to ask the model than to silently mis-read chords as rhythm.
			expect(routeAssistantInput("C Am F G", []).path).toBe("llm");
		});
	});

	it("never throws on arbitrary input", () => {
		for (const junk of ["", "🎸🎸", "|||", "\n\n", "0123", "'; drop table --"]) {
			expect(() => route(junk)).not.toThrow();
		}
	});
});
