// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { INDEX } from "@/lib/assistant/tab/__tests__/fixtures";
import { createGuitarPalServer, type GuitarPalMcpDeps } from "@/lib/mcp/server";
import { ROUTING_CASES, type RoutingCase, type RoutingKind } from "@/lib/mcp/__evals__/routingCases";

/**
 * Does a model call Guitar Pal when it should, and only then (#492)?
 *
 *   MCP_EVAL_LABEL=before npm run evals -- src/lib/mcp
 *
 * The server runs in process and is asked for its tools and instructions over
 * MCP, so the model sees exactly what a client shows it; nothing is called and
 * nothing is written — only the model's first move is graded: which tool it
 * reached for, or none. Every case runs `MCP_EVAL_RUNS` times (3) on each of
 * `MCP_EVAL_MODELS` (the Claude 5.5 family), and the result goes into
 * `routing-results.json` beside this file under the label, so a metadata
 * change is read as the label before against the label after.
 *
 * Anthropic models only, with `ANTHROPIC_API_KEY`. ChatGPT is not covered: no
 * OpenAI key was available when the set was made.
 */

const RUNS = Math.max(1, Number(process.env.MCP_EVAL_RUNS) || 3);
const MODELS = (process.env.MCP_EVAL_MODELS ?? "claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5").split(",").map((m) => m.trim());
const LABEL = process.env.MCP_EVAL_LABEL ?? "";
const RESULTS = path.join(__dirname, "routing-results.json");
const ROOT = path.resolve(__dirname, "../../../..");

/** USD per million tokens, 2026-11; check the pricing page before trusting a figure. */
const PRICE: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
	"claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
	"claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
	"claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/** What the model did first: the tool it called, or null for a plain answer. */
type FirstMove = string | null;

interface ModelResult {
	runs: number;
	cases: Record<string, FirstMove[]>;
	/** Positive cases (direct + indirect) answered by calling the expected tool first, per kind. */
	recall: Record<Exclude<RoutingKind, "negative">, { hit: number; of: number }>;
	/** Negative cases where any tool was called. */
	falseCalls: { hit: number; of: number };
	costUsd: number;
}

interface ResultsFile {
	[label: string]: { at: string; models: Record<string, ModelResult> };
}

function systemPrompt(instructions: string): string {
	return [
		"You are a helpful assistant. The user has connected the following MCP server; its tools are available to you.",
		"",
		`<mcp_server name="guitar-pal">`,
		`<instructions>${instructions}</instructions>`,
		`</mcp_server>`,
	].join("\n");
}

async function serverSurface(): Promise<{ tools: Anthropic.Tool[]; instructions: string }> {
	const deps: GuitarPalMcpDeps = {
		chordIndex: async () => INDEX,
		origin: "https://guitarpal.test",
		async saveShare() {
			throw new Error("the routing eval never writes");
		},
		async loadShare() {
			return null;
		},
	};
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	const server = createGuitarPalServer(deps);
	await server.connect(serverSide);
	const client = new Client({ name: "mcp-routing-eval", version: "0" });
	await client.connect(clientSide);
	const { tools } = await client.listTools();
	const instructions = client.getInstructions() ?? "";
	await client.close();
	await server.close();
	return {
		instructions,
		tools: tools.map((t, i) => ({
			name: t.name,
			description: t.description ?? "",
			input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
			// The tool block is the same for every case: cache it once per model.
			...(i === tools.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
		})),
	};
}

function userContent(c: RoutingCase): Anthropic.ContentBlockParam[] {
	const parts: Anthropic.ContentBlockParam[] = [];
	if (c.image) {
		parts.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(path.join(ROOT, c.image)).toString("base64") } });
	}
	parts.push({ type: "text", text: c.prompt });
	return parts;
}

const runnable = ROUTING_CASES.filter((c) => !c.image || existsSync(path.join(ROOT, c.image)));
const skipped = ROUTING_CASES.filter((c) => !runnable.includes(c));

describe.skipIf(!process.env.ANTHROPIC_API_KEY || LABEL === "")("MCP routing", () => {
	const client = new Anthropic();
	let surface: Awaited<ReturnType<typeof serverSurface>>;
	const results: Record<string, ModelResult> = {};

	beforeAll(async () => {
		surface = await serverSurface();
		if (skipped.length > 0) console.warn(`skipped (no tab gold image): ${skipped.map((c) => c.id).join(", ")}`);
	});

	afterAll(() => {
		const file: ResultsFile = existsSync(RESULTS) ? (JSON.parse(readFileSync(RESULTS, "utf8")) as ResultsFile) : {};
		file[LABEL] = { at: new Date().toISOString(), models: { ...(file[LABEL]?.models ?? {}), ...results } };
		writeFileSync(RESULTS, `${JSON.stringify(file, null, "\t")}\n`);
		for (const [model, r] of Object.entries(results)) {
			const pct = (x: { hit: number; of: number }) => `${x.hit}/${x.of}`;
			console.log(
				`${LABEL} ${model}: direct ${pct(r.recall.direct)}, indirect ${pct(r.recall.indirect)}, false calls ${pct(r.falseCalls)}, $${r.costUsd.toFixed(3)}`,
			);
		}
	});

	for (const model of MODELS) {
		it(model, { timeout: 30 * 60_000 }, async () => {
			const price = PRICE[model];
			expect(price, `no price for ${model}`).toBeDefined();
			const result: ModelResult = {
				runs: RUNS,
				cases: {},
				recall: { direct: { hit: 0, of: 0 }, indirect: { hit: 0, of: 0 } },
				falseCalls: { hit: 0, of: 0 },
				costUsd: 0,
			};
			for (const c of runnable) {
				const moves: FirstMove[] = [];
				for (let run = 0; run < RUNS; run++) {
					const response = await client.messages.create({
						model,
						max_tokens: 4096,
						system: systemPrompt(surface.instructions),
						tools: surface.tools,
						messages: [{ role: "user", content: userContent(c) }],
					});
					const call = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
					moves.push(call ? call.name : null);
					const u = response.usage;
					result.costUsd +=
						(u.input_tokens * price.input +
							u.output_tokens * price.output +
							(u.cache_read_input_tokens ?? 0) * price.cacheRead +
							(u.cache_creation_input_tokens ?? 0) * price.cacheWrite) /
						1e6;
					if (c.kind === "negative") {
						result.falseCalls.of++;
						if (call) result.falseCalls.hit++;
					} else {
						result.recall[c.kind].of++;
						if (call?.name === c.tool) result.recall[c.kind].hit++;
					}
				}
				result.cases[c.id] = moves;
			}
			results[model] = result;
		});
	}
});
