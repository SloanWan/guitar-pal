import { describe, it, expect, vi } from "vitest";
import { EVAL_CASES } from "@/lib/strumAssistant/__evals__/cases";
import { gradeProposal, summarize } from "@/lib/strumAssistant/__evals__/grade";
import { routeAssistantInput } from "@/lib/strumAssistant/router";
import { resolveAssistantTurn } from "@/lib/strumAssistant/turn";
import { isBrowsableSuffix } from "@/lib/chordSuffixes";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { CHORD_ROWS } from "@/lib/__fixtures__/chordData.fixture";

/**
 * The half of the eval set that costs nothing: every case's routing, and the
 * full answer for every case the app reads itself. Part of `npm test`, and
 * asserts on an injected fetch that the model was never reached.
 *
 * The per-path coverage this prints is the number #137 asks for: how much of
 * the set never costs a model call.
 */

const INDEX: readonly ChordIndexEntry[] = CHORD_ROWS.filter((r) =>
	isBrowsableSuffix(r.suffix),
).map((r) => ({ root: r.root, suffix: r.suffix }));

const forbiddenFetch = vi.fn(async () => {
	throw new Error("a deterministic eval case reached the model");
}) as unknown as typeof fetch;

describe("strum assistant eval set — offline", () => {
	it("holds enough cases, on every path", () => {
		expect(EVAL_CASES.length).toBeGreaterThanOrEqual(25);
		const paths = new Set(EVAL_CASES.map((c) => c.path));
		expect([...paths].sort()).toEqual(["chords", "llm", "phrase", "rhythm"]);
		expect(new Set(EVAL_CASES.map((c) => c.id)).size).toBe(EVAL_CASES.length);
	});

	for (const c of EVAL_CASES) {
		it(`routes "${c.input}" → ${c.path}  (${c.id})`, () => {
			expect(routeAssistantInput(c.input, INDEX).path).toBe(c.path);
		});
	}

	const deterministic = EVAL_CASES.filter((c) => c.path !== "llm");

	for (const c of deterministic) {
		it(`answers "${c.input}" without the model  (${c.id})`, async () => {
			const outcome = await resolveAssistantTurn({
				text: c.input,
				history: [{ role: "user", content: c.input }],
				index: INDEX,
				fetchImpl: forbiddenFetch,
			});
			expect(forbiddenFetch).not.toHaveBeenCalled();
			expect(outcome.usedModel).toBe(false);
			expect(outcome.proposal, "no proposal").toBeDefined();
			const grade = gradeProposal(c.expect, outcome.proposal!);
			expect(grade.failures, c.why).toEqual([]);
		});
	}

	it("reports how much of the set never costs a model call", async () => {
		const results = [];
		for (const c of deterministic) {
			const outcome = await resolveAssistantTurn({
				text: c.input,
				history: [{ role: "user", content: c.input }],
				index: INDEX,
				fetchImpl: forbiddenFetch,
			});
			results.push({ case: c, grade: gradeProposal(c.expect, outcome.proposal!) });
		}
		const perPath = summarize(results);
		const covered = deterministic.length;
		const lines = [
			`strum assistant eval set: ${EVAL_CASES.length} cases`,
			`  answered offline: ${covered}/${EVAL_CASES.length} (${Math.round((100 * covered) / EVAL_CASES.length)}%)`,
			...Object.entries(perPath).map(
				([path, { passed, total }]) => `  ${path.padEnd(8)} ${passed}/${total} pass`,
			),
			`  llm      ${EVAL_CASES.length - covered} cases — run \`npm run evals\` to score them`,
		];
		process.stdout.write(`${lines.join("\n")}\n`);
		expect(results.every((r) => r.grade.pass)).toBe(true);
	});
});
