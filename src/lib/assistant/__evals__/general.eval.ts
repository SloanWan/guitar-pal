// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { EVAL_CASES, type EvalCase } from "@/lib/assistant/__evals__/cases";
import { TAB_EVAL_CASES } from "@/lib/assistant/__evals__/tabCases";
import { gradeNoDraft, gradeProposal } from "@/lib/assistant/__evals__/grade";
import { proposeStrum, proposeTab, showChord, strumReadResult, tabReadResult, type ToolExecution } from "@/lib/assistant/general/execute";
import { callGeneral, type ModelAttempt } from "@/lib/assistant/general/model";
import { MODEL, type GeneralContext } from "@/lib/assistant/general/request";
import type { ProposeStrumInput, ProposeTabInput, ReadInput, ShowChordInput, ToolName } from "@/lib/assistant/general/tools";
import { resolveGeneralTurn, type GeneralTurnOutcome, type ToolInput } from "@/lib/assistant/general/turn";
import { resolveAssistantTurn } from "@/lib/assistant/strum/turn";
import { resolveTabTurn } from "@/lib/assistant/tab/turn";
import { INDEX, voicingFor } from "@/lib/assistant/tab/__tests__/fixtures";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";

/**
 * The General assistant, end to end, over every eval case — the loop the
 * panel runs, with the SDK in place of the route and fixtures in place of
 * the chord library. Graded on the tool it chose and on what the tool made.
 *
 *   npm run evals                                   # the default model
 *   ASSISTANT_MODEL=claude-haiku-4-5 npm run evals  # another
 *
 * Never part of `npm test`: the `.eval.ts` suffix keeps it out of the default
 * include. It needs ANTHROPIC_API_KEY and refuses to run without one.
 *
 * Writes `baseline.json` beside this file, one entry per model, so two runs
 * can be read against each other before the orchestrator is chosen.
 */

/** First-party rates, USD per million tokens, as of 2026-09. Check the pricing page before trusting a figure. */
const PRICE: Record<string, { input: number; output: number }> = {
	"claude-opus-5": { input: 5, output: 25 },
	"claude-sonnet-5": { input: 2, output: 10 },
	"claude-haiku-4-5": { input: 1, output: 5 },
};

function costOf(attempts: readonly ModelAttempt[]): number {
	const price = PRICE[MODEL];
	if (!price) return Number.NaN;
	return attempts.reduce(
		(sum, a) =>
			sum +
			(a.inputTokens * price.input + a.outputTokens * price.output + a.cacheReadTokens * price.input * 0.1 + a.cacheWriteTokens * price.input * 1.25) /
				1_000_000,
		0,
	);
}

const STRUM_PATTERNS = [...PRESET_STRUM_PATTERNS, { id: "u-belief", name: "belief" }];
const CONTEXT: GeneralContext = {
	page: null,
	strumNames: STRUM_PATTERNS.map((p) => p.name),
	tabNames: PRESET_FINGERPICK_PATTERNS.map((p) => p.name),
	lang: "en",
};

const execute = async (name: ToolName, input: ToolInput): Promise<ToolExecution> => {
	switch (name) {
		case "read_strum":
		case "edit_strum":
			return strumReadResult(resolveAssistantTurn({ text: (input as ReadInput).text, index: INDEX, patterns: STRUM_PATTERNS }));
		case "read_tab":
		case "edit_tab":
			return tabReadResult(
				await resolveTabTurn({ text: (input as ReadInput).text, index: INDEX, patterns: PRESET_FINGERPICK_PATTERNS, voicings: async () => voicingFor }),
			);
		case "propose_strum":
			return proposeStrum(input as ProposeStrumInput, INDEX);
		case "propose_tab":
			return proposeTab(input as ProposeTabInput);
		case "show_chord":
			return showChord(input as ShowChordInput, INDEX);
	}
};

/** What a strum case asks of the tool choice: the reader for what was written, the composer for what was described. */
function expectedStrumTools(c: EvalCase): ToolName[] | null {
	if (c.path !== "llm") return ["read_strum", "edit_strum"];
	return c.expect.noDraft ? null : ["propose_strum", "read_strum"];
}

interface CaseRun {
	id: string;
	domain: "strum" | "tab";
	input: string;
	toolsUsed: ToolName[];
	calls: number;
	latencyMs: number;
	costUsd: number;
	pass: boolean;
	failures: string[];
	text: string;
	trace: GeneralTurnOutcome["trace"];
}

const runs: CaseRun[] = [];
let client: Anthropic;

async function turn(input: string, context: readonly { role: "user" | "assistant"; content: string }[] = []) {
	const attempts: ModelAttempt[] = [];
	const started = Date.now();
	const outcome = await resolveGeneralTurn({
		text: input,
		history: context,
		context: CONTEXT,
		execute,
		call: async (messages, ctx) => {
			const r = await callGeneral(client, MODEL, messages, ctx);
			attempts.push(r.attempt);
			return r.step;
		},
	});
	return { outcome, attempts, latencyMs: Date.now() - started };
}

function record(id: string, domain: "strum" | "tab", input: string, r: { outcome: GeneralTurnOutcome; attempts: ModelAttempt[]; latencyMs: number }, failures: string[]) {
	runs.push({
		id,
		domain,
		input,
		toolsUsed: r.outcome.toolsUsed,
		calls: r.outcome.calls,
		latencyMs: r.latencyMs,
		costUsd: costOf(r.attempts),
		pass: failures.length === 0,
		failures,
		text: r.outcome.text,
		trace: r.outcome.trace,
	});
}

/** The one rule, checked on every reply: nothing that looks like a tab or a fret in the prose. */
const LEAKED_NOTATION = /^[eEBGDA]\|[-0-9]/m;

describe(`General assistant eval set — ${MODEL}`, () => {
	beforeAll(() => {
		if (!process.env.ANTHROPIC_API_KEY) {
			throw new Error("ANTHROPIC_API_KEY is not set; the model evals spend real money and will not guess a key.");
		}
		client = new Anthropic();
	});

	for (const c of EVAL_CASES.filter((c) => c.input.trim() !== "")) {
		it(`strum "${c.input}"  (${c.id})`, async () => {
			const r = await turn(c.input, c.context ?? []);
			const failures: string[] = [];
			const wanted = expectedStrumTools(c);
			const used = r.outcome.toolsUsed;
			// An open case — the model path with nothing asserted — wants a card,
			// either domain: the sentence was ambiguous to the rules, and may be
			// to the reader too.
			if (c.path === "llm" && Object.keys(c.expect).length === 0) {
				if (!r.outcome.card) failures.push(`no card (tools: ${used.join(",") || "-"})`);
				if (LEAKED_NOTATION.test(r.outcome.text)) failures.push("notation in the reply text");
				record(c.id, "strum", c.input, r, failures);
				return;
			}
			if (wanted === null) {
				if (r.outcome.card) failures.push(`a card was shown where none was expected (tools: ${used.join(",") || "-"})`);
			} else if (!used.some((t) => wanted.includes(t))) {
				failures.push(`expected one of ${wanted.join("/")}, used ${used.join(",") || "no tool"}`);
			}
			if (LEAKED_NOTATION.test(r.outcome.text)) failures.push("notation in the reply text");
			const card = r.outcome.card;
			if (card && card.domain === "strum" && "proposal" in card) {
				failures.push(...gradeProposal(c.expect, card.proposal).failures);
			} else if (card && card.domain === "tab") {
				failures.push("a tab card for a strum case");
			} else if (!card && wanted !== null && !c.expect.noDraft) {
				failures.push("no card");
			} else if (!card) {
				failures.push(...gradeNoDraft(c.expect).failures);
			}
			record(c.id, "strum", c.input, r, failures);
		}, 120_000);
	}

	for (const c of TAB_EVAL_CASES) {
		it(`tab "${c.input}"  (${c.id})`, async () => {
			const r = await turn(c.input);
			const failures: string[] = [];
			const used = r.outcome.toolsUsed;
			const wanted = c.tool === null ? null : Array.isArray(c.tool) ? c.tool : [c.tool];
			if (wanted === null) {
				if (r.outcome.card) failures.push(`a card was shown where none was expected (tools: ${used.join(",") || "-"})`);
			} else if (!used.some((t) => wanted.includes(t))) {
				failures.push(`expected ${wanted.join("/")}, used ${used.join(",") || "no tool"}`);
			}
			if (LEAKED_NOTATION.test(r.outcome.text)) failures.push("notation in the reply text");
			const card = r.outcome.card;
			if (c.expect.noCard && card) failures.push("a card was shown");
			if (!c.expect.noCard && !card) failures.push("no card");
			if (card && card.domain === "tab") {
				const pattern = "tabProposal" in card ? card.tabProposal.pattern : "measures" in card.tabEdit ? { measures: card.tabEdit.measures, timeSignature: card.tabEdit.pattern.timeSignature } : null;
				if (pattern && c.expect.bars) {
					const n = pattern.measures.length;
					if (n < c.expect.bars[0] || n > c.expect.bars[1]) failures.push(`${n} bars, expected ${c.expect.bars.join("–")}`);
				}
				if (pattern && c.expect.timeSignature && pattern.timeSignature.join("/") !== c.expect.timeSignature.join("/")) {
					failures.push(`meter ${pattern.timeSignature.join("/")}, expected ${c.expect.timeSignature.join("/")}`);
				}
			} else if (card) {
				failures.push("a strum card for a tab case");
			}
			record(c.id, "tab", c.input, r, failures);
		}, 120_000);
	}

	it("writes the baseline", () => {
		const file = path.join(__dirname, "baseline.json");
		const existing: { models?: Record<string, unknown> } = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
		const models = existing.models ?? {};
		const totalCost = runs.reduce((s, r) => s + r.costUsd, 0);
		const passed = runs.filter((r) => r.pass).length;
		const byDomain = (d: "strum" | "tab") => {
			const rs = runs.filter((r) => r.domain === d);
			return { total: rs.length, passed: rs.filter((r) => r.pass).length };
		};
		models[MODEL] = {
			recordedAt: new Date().toISOString(),
			cases: runs.length,
			passRate: runs.length ? passed / runs.length : 0,
			strum: byDomain("strum"),
			tab: byDomain("tab"),
			costPerTurnUsd: runs.length ? totalCost / runs.length : 0,
			callsPerTurn: runs.length ? runs.reduce((s, r) => s + r.calls, 0) / runs.length : 0,
			meanLatencyMs: Math.round(runs.reduce((s, r) => s + r.latencyMs, 0) / Math.max(1, runs.length)),
			runs,
		};
		writeFileSync(file, `${JSON.stringify({ models }, null, "\t")}\n`);
		const m = models[MODEL] as { strum: { passed: number; total: number }; tab: { passed: number; total: number }; costPerTurnUsd: number; callsPerTurn: number; meanLatencyMs: number };
		process.stdout.write(
			[
				`${MODEL}: ${passed}/${runs.length} pass (strum ${m.strum.passed}/${m.strum.total}, tab ${m.tab.passed}/${m.tab.total})`,
				`  cost per turn: $${m.costPerTurnUsd.toFixed(4)} ($${totalCost.toFixed(4)} total); calls per turn: ${m.callsPerTurn.toFixed(2)}`,
				`  mean latency: ${m.meanLatencyMs} ms`,
				...runs.filter((r) => !r.pass).map((r) => `  MISS ${r.id}: ${r.failures.join("; ")}`),
			].join("\n") + "\n",
		);
		expect(runs.length).toBe(EVAL_CASES.filter((c) => c.input.trim() !== "").length + TAB_EVAL_CASES.length);
	});
});
