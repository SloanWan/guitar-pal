import { describe, it, expect } from "vitest";
import {
	resolveAssistantTurn,
	editMessage,
	DETERMINISTIC_REPLY,
	PHRASE_REPLY,
} from "@/lib/strumAssistant/turn";
import { BLANK } from "@/lib/strumAssistant/suggest";
import { isBrowsableSuffix } from "@/lib/chordSuffixes";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { CHORD_ROWS } from "@/lib/__fixtures__/chordData.fixture";

/**
 * Every turn is decided by the app. A sentence is read by rules, and one the
 * rules cannot read is answered with what was read and sentences that would
 * have worked — never sent anywhere to be guessed at. The function is
 * synchronous, which is the strongest form of that assertion.
 */

// The same chord corpus the proposal builder's tests use, so a word that
// resolves here resolves in the app for the same reason.
const INDEX: readonly ChordIndexEntry[] = CHORD_ROWS.filter((r) =>
	isBrowsableSuffix(r.suffix),
).map((r) => ({ root: r.root, suffix: r.suffix }));

const PATTERNS = [
	{ id: "p-belief", name: "belief" },
	{ id: "preset-old", name: "old faithful" },
];

const resolve = (text: string) => resolveAssistantTurn({ text, index: INDEX, patterns: PATTERNS });

describe("resolveAssistantTurn", () => {
	describe("reads what it can", () => {
		it("answers a plain chord line", () => {
			const outcome = resolve("C Am F G");
			expect(outcome.text).toBe(DETERMINISTIC_REPLY);
			expect(outcome.proposal?.chords).toHaveLength(4);
			// No rhythm was asked for, so one was chosen — and said so.
			expect(outcome.proposal?.warnings.rhythmGuessed).toBe(true);
			expect(outcome.templates).toBeUndefined();
		});

		it("answers a typed rhythm", () => {
			const outcome = resolve("D DU UD");
			expect(outcome.proposal?.rhythm).toBe("D DU UD");
			expect(outcome.proposal?.warnings.rhythmGuessed).toBe(false);
		});

		it("answers a sentence the lexicon can read", () => {
			const outcome = resolve("给我一个 C-G-Am-F 的民谣扫弦，慢一点");
			expect(outcome.text).toBe(PHRASE_REPLY);
			expect(outcome.proposal?.chords).toHaveLength(4);
			expect(outcome.proposal?.rhythm).toBe("D DU UD");
			expect(outcome.proposal?.bpm).toBe(70);
			// The strokes came from the style word, not from the player.
			expect(outcome.proposal?.warnings.rhythmGuessed).toBe(true);
		});

		it("answers chords and a rhythm together", () => {
			const outcome = resolve("C Am F G, DUDUDUDU");
			expect(outcome.proposal?.bars).toHaveLength(4);
			expect(outcome.proposal?.chords).toHaveLength(4);
		});
	});

	describe("an edit to a pattern that already exists", () => {
		it("reads it, and writes nothing", () => {
			const outcome = resolve("添加一个 Em9-D-C#-F#m7 和弦进行去 belief 里");
			expect(outcome.proposal).toBeUndefined();
			expect(outcome.edit).toMatchObject({
				kind: "attach",
				pattern: { id: "p-belief" },
				chordWords: ["Em9", "D", "C#", "F#m7"],
			});
			// The message is the app's own words.
			expect(outcome.text).toContain("belief");
		});

		it("is read before the chord line the same words would otherwise be", () => {
			expect(resolve("add C G Am F to belief").edit?.kind).toBe("attach");
		});

		it("says so when the pattern is not one the player has", () => {
			const outcome = resolve("add C G Am F to wonderwall");
			expect(outcome.edit).toMatchObject({ kind: "unknown-pattern", name: "wonderwall" });
			expect(outcome.text).toContain("wonderwall");
		});

		it("leaves every other sentence to the readers after it", () => {
			for (const text of ["C Am F G", "D DU UD", "给我一个 C-G-Am-F 的民谣扫弦，慢一点"]) {
				const outcome = resolve(text);
				expect(outcome.edit, text).toBeUndefined();
				expect(outcome.proposal, text).toBeDefined();
			}
		});
	});

	describe("a sentence nothing read", () => {
		it("offers sentences with blanks instead of a guess", () => {
			const outcome = resolve("something dreamy for a rainy day");
			expect(outcome.proposal).toBeUndefined();
			expect(outcome.edit).toBeUndefined();
			expect(outcome.failed).toBeUndefined();
			expect(outcome.templates?.length).toBeGreaterThan(0);
			expect(outcome.templates?.some((t) => t.includes(BLANK))).toBe(true);
		});

		it("keeps the chords it did read in what it offers", () => {
			const outcome = resolve("C G Am F but dreamy");
			expect(outcome.templates).toContain("C G Am F");
			expect(outcome.templates).toContain(`add C G Am F to ${BLANK}`);
		});

		it("asks rather than guesses when a rename names no new name", () => {
			expect(resolve("rename belief").edit).toMatchObject({ kind: "rename", newName: "" });
		});
	});

	it("says what it understood in one language, whatever was typed", () => {
		const zh = editMessage({
			kind: "attach",
			op: "attach",
			pattern: { id: "p-belief", name: "belief" },
			chordWords: ["C"],
		});
		expect(zh).toContain("belief");
		expect(
			editMessage({ kind: "unknown-pattern", op: "attach", name: "summer", chordWords: [] }),
		).toContain("summer");
		expect(
			editMessage({
				kind: "ambiguous",
				op: "attach",
				name: "belief",
				matches: [
					{ id: "a", name: "belief" },
					{ id: "b", name: "Belief" },
				],
			}),
		).toContain("2");
	});
});
