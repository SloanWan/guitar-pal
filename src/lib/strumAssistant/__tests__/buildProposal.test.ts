import { describe, it, expect } from "vitest";
import { buildProposal, proposalToPattern } from "@/lib/strumAssistant/buildProposal";
import { isBrowsableSuffix } from "@/lib/chordSuffixes";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { CHORD_ROWS } from "@/lib/__fixtures__/chordData.fixture";

const index: readonly ChordIndexEntry[] = CHORD_ROWS.filter((r) =>
	isBrowsableSuffix(r.suffix),
).map((r) => ({ root: r.root, suffix: r.suffix }));

const build = (input: Partial<Parameters<typeof buildProposal>[0]>) =>
	buildProposal({ chordWords: [], index, ...input });

function unwrap(result: ReturnType<typeof buildProposal>) {
	if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("; "));
	return result.proposal;
}

describe("buildProposal", () => {
	it("makes a bare pattern from a rhythm alone", () => {
		const p = unwrap(build({ rhythm: "D DU UD" }));
		expect(p.kind).toBe("pattern");
		expect(p.bars).toHaveLength(1);
		expect(p.bars[0].chord).toBeNull();
		expect(p.bars[0].beats).toEqual([
			["D", "UG"],
			["D", "U"],
			["DG", "U"],
			["D", "UG"],
		]);
	});

	it("gives every chord its own bar of the same rhythm", () => {
		const p = unwrap(build({ rhythm: "D DU UD", chordWords: ["C", "G", "Am", "F"] }));
		expect(p.kind).toBe("progression");
		expect(p.bars).toHaveLength(4);
		expect(p.bars.map((b) => b.chord?.root)).toEqual(["C", "G", "A", "F"]);
		// Each bar carries its own copy, so editing one cannot alter another.
		expect(p.bars[0].beats).toEqual(p.bars[1].beats);
		expect(p.bars[0].beats).not.toBe(p.bars[1].beats);
	});

	it("lines chords up bar by bar when the rhythm is written per bar", () => {
		const p = unwrap(build({ rhythm: "D DU UD|DUDUDUDU", chordWords: ["C", "G"] }));
		expect(p.bars).toHaveLength(2);
		expect(p.bars[0].chord?.root).toBe("C");
		expect(p.bars[1].chord?.root).toBe("G");
		expect(p.bars[1].beats[0]).toEqual(["D", "U"]);
	});

	it("leaves a written bar past the last chord without one", () => {
		const p = unwrap(build({ rhythm: "DUDUDUDU|DUDUDUDU|DUDUDUDU", chordWords: ["C", "G"] }));
		expect(p.bars.map((b) => b.chord?.root ?? null)).toEqual(["C", "G", null]);
	});

	describe("when no rhythm was given", () => {
		it("falls back to a preset rhythm and says so", () => {
			const p = unwrap(build({ chordWords: ["C", "G"] }));
			expect(p.warnings.rhythmGuessed).toBe(true);
			expect(p.rhythm).toBe("D DU UD");
			expect(p.bars).toHaveLength(2);
		});

		it("treats an empty rhythm string the same as none", () => {
			expect(unwrap(build({ rhythm: "   ", chordWords: ["C"] })).warnings.rhythmGuessed).toBe(true);
		});

		it("keeps the flag set when the model admits it guessed", () => {
			const p = unwrap(build({ rhythm: "DUDU", chordWords: ["C"], rhythmGuessed: true }));
			expect(p.warnings.rhythmGuessed).toBe(true);
		});
	});

	describe("warnings", () => {
		it("reports chord words that matched nothing", () => {
			const p = unwrap(build({ rhythm: "DUDU", chordWords: ["C", "Zq", "G"] }));
			expect(p.warnings.unresolvedChords).toEqual(["Zq"]);
			expect(p.bars).toHaveLength(2);
		});

		it("reports a bar padded out with rests", () => {
			expect(unwrap(build({ rhythm: "D", chordWords: [] })).warnings.padded).toBe(true);
			expect(unwrap(build({ rhythm: "DUDUDUDU" })).warnings.padded).toBe(false);
		});

		it("carries the deterministic-fallback flag through", () => {
			const p = unwrap(build({ rhythm: "DUDU", fellBackToDeterministic: true }));
			expect(p.warnings.fellBackToDeterministic).toBe(true);
		});
	});

	it("reports parse errors instead of throwing", () => {
		const result = build({ rhythm: "not notation" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors[0].code).toBe("invalid-character");
	});

	it("clamps a nonsense tempo rather than storing it", () => {
		const p = unwrap(build({ rhythm: "DUDU", bpm: 100000 }));
		expect(p.bpm).toBeGreaterThan(0);
		expect(p.bpm).toBeLessThan(1000);
	});

	it("names a progression after its chords", () => {
		const p = unwrap(build({ rhythm: "DUDU", chordWords: ["C", "G", "Am", "F"] }));
		expect(p.name.length).toBeGreaterThan(0);
		expect(p.name).not.toBe("Assistant pattern");
	});

	it("converts a confirmed proposal into a saveable pattern", () => {
		const p = unwrap(build({ rhythm: "D DU UD", chordWords: ["C", "G"], bpm: 90 }));
		const pattern = proposalToPattern(p, "assistant-1");
		expect(pattern.id).toBe("assistant-1");
		expect(pattern.bpm).toBe(90);
		expect(pattern.beats).toEqual(p.bars[0].beats);
	});
});
