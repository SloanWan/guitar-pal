import { describe, it, expect } from "vitest";
import { draftFromToolOutput } from "../draftFromToolOutput";
import { normalizeImportedPattern } from "../normalizeImportedPattern";
import type { VisionToolOutput } from "../visionToolSchema";
import type { StringFret } from "@/lib/fingerpickTypes";

function stdOutput(over: Partial<VisionToolOutput> = {}): VisionToolOutput {
	return {
		notation: "standard",
		timeSignature: [4, 4],
		measures: [],
		...over,
	};
}

// The transform returns `raw` as `unknown`; these helpers narrow for assertions.
type RawPattern = {
	measures: Array<{ id: string; slots: Array<{ id: string; duration: string; strings: StringFret[] }> }>;
	timeSignature: [number, number];
	name?: string;
	bpm?: number;
};

function asRaw(raw: unknown): RawPattern {
	return raw as RawPattern;
}

describe("draftFromToolOutput", () => {
	it("expands a sparse notes array into a strict 6-element strings tuple", () => {
		const output = stdOutput({
			measures: [
				{ slots: [{ duration: "quarter", notes: [{ string: 0, fret: 3 }, { string: 5, fret: 0 }] }] },
			],
		});

		const { raw } = draftFromToolOutput(output);
		const strings = asRaw(raw).measures[0].slots[0].strings;

		expect(strings).toHaveLength(6);
		// Reported strings carry their fret...
		expect(strings[0]).toMatchObject({ fret: 3, muted: false, tied: false, technique: null });
		expect(strings[5]).toMatchObject({ fret: 0, muted: false });
		// ...unreported strings are padded silent.
		for (const i of [1, 2, 3, 4]) {
			expect(strings[i]).toEqual({ fret: null, technique: null, tied: false, muted: false });
		}
	});

	it("maps fret \"x\" to fret:null, muted:true", () => {
		const output = stdOutput({
			measures: [{ slots: [{ duration: "quarter", notes: [{ string: 2, fret: "x" }] }] }],
		});

		const { raw } = draftFromToolOutput(output);
		expect(asRaw(raw).measures[0].slots[0].strings[2]).toMatchObject({ fret: null, muted: true });
	});

	it("converts confidence:low into a MODEL_LOW_CONFIDENCE warning with the correct path", () => {
		const output = stdOutput({
			measures: [
				{ slots: [{ duration: "quarter", notes: [] }] },
				{ slots: [
					{ duration: "eighth", notes: [] },
					{ duration: "eighth", notes: [{ string: 4, fret: 7, confidence: "low", note: "smudged" }] },
				] },
			],
		});

		const { modelWarnings } = draftFromToolOutput(output);
		expect(modelWarnings).toHaveLength(1);
		expect(modelWarnings[0]).toMatchObject({
			code: "MODEL_LOW_CONFIDENCE",
			message: "smudged",
			path: "measures[1].slots[1].strings[4]",
		});
	});

	it("falls back to a default message when a low-confidence note omits `note`", () => {
		const output = stdOutput({
			measures: [{ slots: [{ duration: "quarter", notes: [{ string: 0, fret: 5, confidence: "low" }] }] }],
		});

		const { modelWarnings } = draftFromToolOutput(output);
		expect(modelWarnings[0].code).toBe("MODEL_LOW_CONFIDENCE");
		expect(modelWarnings[0].message.length).toBeGreaterThan(0);
	});

	it("resolves a technique+tied conflict by keeping technique and forcing tied:false", () => {
		const output = stdOutput({
			measures: [{ slots: [{ duration: "quarter", notes: [
				{ string: 1, fret: 5, technique: "hammer-on", tied: true },
			] }] }],
		});

		const { raw, modelWarnings } = draftFromToolOutput(output);
		const sf = asRaw(raw).measures[0].slots[0].strings[1];
		expect(sf).toMatchObject({ fret: 5, technique: "hammer-on", tied: false });

		const conflict = modelWarnings.find((w) => w.code === "MODEL_TECHNIQUE_TIED_CONFLICT");
		expect(conflict).toBeDefined();
		expect(conflict?.path).toBe("measures[0].slots[0].strings[1]");
	});

	it("keeps a plain tie (no technique) as tied:true without a conflict warning", () => {
		const output = stdOutput({
			measures: [{ slots: [{ duration: "quarter", notes: [{ string: 1, fret: 5, tied: true }] }] }],
		});

		const { raw, modelWarnings } = draftFromToolOutput(output);
		expect(asRaw(raw).measures[0].slots[0].strings[1]).toMatchObject({ tied: true, technique: null });
		expect(modelWarnings.some((w) => w.code === "MODEL_TECHNIQUE_TIED_CONFLICT")).toBe(false);
	});

	it.each(["chord-framed", "unknown"] as const)(
		"short-circuits for non-standard notation: %s",
		(notation) => {
			const result = draftFromToolOutput(stdOutput({
				notation,
				measures: [{ slots: [{ duration: "quarter", notes: [{ string: 0, fret: 3 }] }] }],
				repeats: [{ range: [0, 0], times: 2 }],
			}));

			expect(result.raw).toBeNull();
			expect(result.unsupportedNotation).toBe(notation);
			expect(result.repeats).toEqual([]);
			expect(result.modelWarnings).toEqual([]);
		},
	);

	it("passes repeats through unchanged", () => {
		const repeats = [{ range: [0, 1] as [number, number], times: 3 }];
		const result = draftFromToolOutput(stdOutput({
			measures: [{ slots: [{ duration: "quarter", notes: [] }] }],
			repeats,
		}));
		expect(result.repeats).toEqual(repeats);
		expect(result.unsupportedNotation).toBeNull();
	});

	it("defaults repeats to an empty array when omitted", () => {
		const result = draftFromToolOutput(stdOutput({
			measures: [{ slots: [{ duration: "quarter", notes: [] }] }],
		}));
		expect(result.repeats).toEqual([]);
	});

	it("generates unique ids across every measure and slot", () => {
		const output = stdOutput({
			measures: [
				{ slots: [
					{ duration: "eighth", notes: [] },
					{ duration: "eighth", notes: [] },
				] },
				{ slots: [
					{ duration: "eighth", notes: [] },
					{ duration: "eighth", notes: [] },
				] },
			],
		});

		const { raw } = draftFromToolOutput(output);
		const measures = asRaw(raw).measures;
		const ids = [
			...measures.map((m) => m.id),
			...measures.flatMap((m) => m.slots.map((s) => s.id)),
		];
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
	});

	// ─── Contract proof: bridge mates with #114 ───────────────────────────────────

	it("feeds a realistic multi-measure output cleanly into normalizeImportedPattern", () => {
		const output = stdOutput({
			name: "Travis Pattern",
			bpm: 96,
			timeSignature: [4, 4],
			measures: [
				// A full 4/4 bar: eight eighth-notes (32 thirty-second units).
				{ slots: [
					{ duration: "eighth", notes: [{ string: 5, fret: 0 }, { string: 1, fret: 1 }] },
					{ duration: "eighth", notes: [{ string: 2, fret: 0 }] },
					{ duration: "eighth", notes: [{ string: 3, fret: 2 }] },
					{ duration: "eighth", notes: [{ string: 1, fret: 1, technique: "pull-off" }] },
					{ duration: "eighth", notes: [{ string: 4, fret: 2 }, { string: 1, fret: 1 }] },
					{ duration: "eighth", notes: [{ string: 2, fret: 0 }] },
					{ duration: "eighth", notes: [{ string: 3, fret: 2 }] },
					{ duration: "eighth", notes: [{ string: 0, fret: 3 }] },
				] },
				{ slots: [
					{ duration: "quarter", notes: [{ string: 4, fret: 2, tied: true }] },
					{ duration: "quarter", notes: [{ string: 0, fret: "x" }] },
					{ duration: "half", notes: [{ string: 0, fret: 3 }, { string: 4, fret: 2 }] },
				] },
			],
			repeats: [{ range: [0, 1], times: 2 }],
		});

		const draft = draftFromToolOutput(output);
		const result = normalizeImportedPattern(draft.raw, draft.repeats);

		expect(result.errors).toEqual([]);
		expect(result.pattern).not.toBeNull();
		expect(result.pattern?.name).toBe("Travis Pattern");
		expect(result.pattern?.bpm).toBe(96);
		// range [0,1] x2 doubles the two original measures.
		expect(result.pattern?.measures).toHaveLength(4);
	});
});
