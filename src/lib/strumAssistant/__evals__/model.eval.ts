// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { EVAL_CASES } from "@/lib/strumAssistant/__evals__/cases";
import { gradeNoDraft, gradeProposal, summarize } from "@/lib/strumAssistant/__evals__/grade";
import { askModel, MODEL, type AskModelResult } from "@/lib/strumAssistant/askModel";
import { buildProposal } from "@/lib/strumAssistant/buildProposal";
import { isBrowsableSuffix } from "@/lib/chordSuffixes";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { CHORD_ROWS } from "@/lib/__fixtures__/chordData.fixture";

/**
 * The half of the eval set that costs money: every case the router hands to
 * the model, run through `askModel` — the same function the route runs — and
 * graded the same way the offline cases are.
 *
 *   npm run evals
 *
 * Never part of `npm test`: the `.eval.ts` suffix keeps it out of the default
 * include, and `vitest.evals.config.ts` is the only thing that picks it up. It
 * needs ANTHROPIC_API_KEY in the environment and refuses to run without one.
 *
 * Writes `baseline.json` beside this file: the pass rate and the measured cost
 * per request, so a prompt edit can be compared against a number.
 */

const cases = EVAL_CASES.filter((c) => c.path === "llm" && c.input.trim() !== "");

const INDEX: readonly ChordIndexEntry[] = CHORD_ROWS.filter((r) =>
	isBrowsableSuffix(r.suffix),
).map((r) => ({ root: r.root, suffix: r.suffix }));

/**
 * First-party API rates, USD per million tokens, as of 2026-09. Check
 * https://claude.com/pricing before trusting a figure computed from these.
 */
const PRICE = {
	"claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
} as const;

function costOf(result: AskModelResult): number {
	const price = PRICE[MODEL as keyof typeof PRICE];
	if (!price) return Number.NaN;
	return result.attempts.reduce(
		(sum, a) =>
			sum +
			(a.inputTokens * price.input +
				a.outputTokens * price.output +
				a.cacheReadTokens * price.cacheRead +
				a.cacheWriteTokens * price.cacheWrite) /
				1_000_000,
		0,
	);
}

interface CaseRun {
	id: string;
	input: string;
	outcome: AskModelResult["outcome"];
	attempts: number;
	latencyMs: number;
	costUsd: number;
	pass: boolean;
	failures: string[];
	message: string;
	draft: unknown;
}

const runs: CaseRun[] = [];
let client: Anthropic;

describe("strum assistant eval set — model path", () => {
	beforeAll(() => {
		if (!process.env.ANTHROPIC_API_KEY) {
			throw new Error("ANTHROPIC_API_KEY is not set; the model evals spend real money and will not guess a key.");
		}
		client = new Anthropic();
	});

	for (const c of cases) {
		it(`"${c.input}"  (${c.id})`, async () => {
			const result = await askModel(client, [{ role: "user", content: c.input }]);

			// The reply is notation and chord words; frets and pitches cannot be in it.
			expect(JSON.stringify(result.reply)).not.toMatch(/frets|midi|voicing/i);

			let grade;
			let draft: unknown = null;
			if (result.reply.draft) {
				draft = result.reply.draft;
				const built = buildProposal({
					rhythm: result.reply.draft.rhythm,
					chordWords: result.reply.draft.chords,
					name: result.reply.draft.name,
					bpm: result.reply.draft.bpm,
					rhythmGuessed: result.reply.draft.rhythmGuessed,
					index: INDEX,
				});
				grade = built.ok
					? c.expect.noDraft
						? { pass: false, failures: ["a draft was offered where a question was expected"] }
						: gradeProposal(c.expect, built.proposal)
					: { pass: false, failures: built.errors.map((e) => e.message) };
			} else {
				grade = gradeNoDraft(c.expect);
			}

			runs.push({
				id: c.id,
				input: c.input,
				outcome: result.outcome,
				attempts: result.attempts.length,
				latencyMs: result.latencyMs,
				costUsd: costOf(result),
				pass: grade.pass,
				failures: grade.failures,
				message: result.reply.message,
				draft,
			});
			// Recorded, not asserted: a baseline is a measurement, and one miss
			// must not hide the rest of the numbers.
		}, 60_000);
	}

	it("writes the baseline", () => {
		const graded = runs.map((r) => ({
			case: cases.find((c) => c.id === r.id)!,
			grade: { pass: r.pass, failures: r.failures },
		}));
		const perPath = summarize(graded);
		const totalCost = runs.reduce((s, r) => s + r.costUsd, 0);
		const meanLatency = runs.reduce((s, r) => s + r.latencyMs, 0) / Math.max(1, runs.length);
		const baseline = {
			recordedAt: new Date().toISOString(),
			model: MODEL,
			cases: runs.length,
			passRate: perPath.llm ? perPath.llm.passed / perPath.llm.total : 0,
			costPerRequestUsd: runs.length ? totalCost / runs.length : 0,
			meanLatencyMs: Math.round(meanLatency),
			repairs: runs.filter((r) => r.attempts > 1).length,
			outcomes: runs.reduce<Record<string, number>>((acc, r) => {
				acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
				return acc;
			}, {}),
			runs,
		};
		writeFileSync(
			path.join(__dirname, "baseline.json"),
			`${JSON.stringify(baseline, null, "\t")}\n`,
		);
		process.stdout.write(
			[
				`model path: ${perPath.llm?.passed ?? 0}/${perPath.llm?.total ?? 0} pass`,
				`  cost per request: $${baseline.costPerRequestUsd.toFixed(4)} (${runs.length} requests, $${totalCost.toFixed(4)} total)`,
				`  mean latency: ${baseline.meanLatencyMs} ms; repairs: ${baseline.repairs}`,
				...runs.filter((r) => !r.pass).map((r) => `  MISS ${r.id}: ${r.failures.join("; ")}`),
			].join("\n") + "\n",
		);
		expect(runs.length).toBe(cases.length);
	});
});
