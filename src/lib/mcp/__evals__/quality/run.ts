/**
 * Guitar Pal MCP eval: general models composing a tab, composing a strum, and
 * reading a tab image, through the REAL MCP server run in process (fake store,
 * the chord index fixture, no network to the app, nothing written anywhere but
 * this folder). The reading task needs the gitignored tab gold
 * (book-service/materials/tab-gold) and the book service's venv for its scorer.
 *
 * From the repo root. runs/ (gitignored) holds the transcripts and the full
 * report, which quotes the gold; results.md beside this file is the 2026-11-12
 * report without those per-run differences.
 *
 *   set -a; . ./.env.local; set +a
 *   EVAL=src/lib/mcp/__evals__/quality
 *   npx -y tsx --tsconfig tsconfig.json $EVAL/run.ts run --task tab,strum,read \
 *       --models claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5 --runs 3 --max-usd 15
 *   npx -y tsx --tsconfig tsconfig.json $EVAL/run.ts report
 *
 * OpenAI (needs OPENAI_API_KEY): --models openai:auto picks the current GPT ids
 * from /v1/models and runs Instant (chat-latest) plus the reasoning model at
 * none/minimal, low, medium and high effort. Or name them: openai:gpt-5.2@medium,
 * openai:gpt-5.2-chat-latest.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { INDEX } from "@/lib/assistant/tab/__tests__/fixtures";
import { createGuitarPalServer, type GuitarPalMcpDeps } from "@/lib/mcp/server";
import { readSharedItem, toSharePayload, type SharedItem } from "@/lib/sharedItems";
import { DURATION_TICKS } from "@/lib/fingerpickEdit";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { patternCapo } from "@/lib/fingerpickChords";
import { patternBpm, patternMeter } from "@/lib/strumBars";
import { patternRhythm } from "@/lib/strumRhythm";
import { chordAbbreviation, progressionCapo } from "@/lib/strumProgressions";
import { READ_CASES, STRUM_CASES, TAB_CASES, type ComposeCase, type ReadCase, type Task } from "./cases";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = process.env.EVAL_RUNS_DIR ?? path.join(HERE, "runs");
/** The repo root: this file sits at src/lib/mcp/__evals__/quality/. */
const ROOT = path.resolve(HERE, "../../../../..");
const GOLD_ROOT = path.join(ROOT, "book-service/materials/tab-gold");
const PYTHON = path.join(ROOT, "book-service/.venv/bin/python");
const MAX_TOOL_CALLS = 4;
/** OPENAI_BASE_URL points the OpenAI half at a mock for a dry run. */
const OPENAI_BASE = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const MAX_MODEL_TURNS = 6;
const ORIGIN = "https://guitarpal.test";
const EXPECTED_TOOL: Record<Task, string> = { tab: "propose_tab", strum: "propose_strum", read: "import_tab" };

// ─── Prices (USD per million tokens) ──────────────────────────────────────────

interface Price {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	verified: boolean;
}
const ANTHROPIC_PRICES: Record<string, Price> = {
	"claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, verified: true },
	"claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5, verified: true },
	"claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125, verified: true },
};
/** Not verified on this machine (no key): edit before trusting the spend column, or set OPENAI_PRICE_IN / OPENAI_PRICE_OUT. */
function openaiPrice(model: string): Price {
	const envIn = Number(process.env.OPENAI_PRICE_IN);
	const envOut = Number(process.env.OPENAI_PRICE_OUT);
	if (envIn > 0 && envOut > 0) return { input: envIn, output: envOut, cacheRead: envIn / 10, cacheWrite: envIn, verified: true };
	if (/mini/.test(model)) return { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0.25, verified: false };
	if (/nano/.test(model)) return { input: 0.05, output: 0.4, cacheRead: 0.005, cacheWrite: 0.05, verified: false };
	return { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25, verified: false };
}

interface Usage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}
const zeroUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
function costOf(u: Usage, p: Price): number {
	return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1e6;
}

// ─── The MCP server, in process ───────────────────────────────────────────────

interface McpTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

async function openServer() {
	const shares: SharedItem[] = [];
	let n = 0;
	const deps: GuitarPalMcpDeps = {
		chordIndex: async () => INDEX,
		origin: ORIGIN,
		async saveShare(item) {
			const id = `evalshare${String(++n)}`.slice(0, 10).padEnd(10, "0");
			// Through the payload and back, as the table hands it to the page.
			const read = readSharedItem({ id, kind: item.kind, payload: toSharePayload(item) });
			if (!read) throw new Error("the share did not read back");
			shares.push(read);
			return { id, expiresAt: new Date(Date.now() + 30 * 86_400_000) };
		},
		async loadShare() {
			return null;
		},
	};
	const [ct, st] = InMemoryTransport.createLinkedPair();
	const server = createGuitarPalServer(deps);
	await server.connect(st);
	const client = new Client({ name: "mcp-eval", version: "0" });
	await client.connect(ct);
	const { tools } = await client.listTools();
	const instructions = client.getInstructions() ?? "";
	return {
		shares,
		instructions,
		tools: tools.map((t) => ({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema as Record<string, unknown> })) as McpTool[],
		async call(name: string, args: unknown): Promise<{ text: string; isError: boolean }> {
			try {
				const r = (await client.callTool({ name, arguments: (args ?? {}) as Record<string, unknown> })) as {
					content: { type: string; text?: string }[];
					isError?: boolean;
				};
				return { text: r.content.map((c) => c.text ?? "").join("\n"), isError: r.isError === true };
			} catch (error) {
				return { text: `MCP error: ${(error as Error).message}`, isError: true };
			}
		},
		async close() {
			await client.close();
			await server.close();
		},
	};
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

// ─── One run ──────────────────────────────────────────────────────────────────

interface ToolCallRecord {
	tool: string;
	ok: boolean;
	input: unknown;
	result: string;
}

interface RunRecord {
	task: Task;
	case: string;
	model: string;
	run: number;
	settings: Record<string, unknown>;
	calls: ToolCallRecord[];
	finalText: string;
	stopReason: string | null;
	usage: Usage;
	costUsd: number;
	priceVerified: boolean;
	share: SharedItem | null;
	error?: string;
	transcript: unknown[];
	startedAt: string;
	ms: number;
}

interface Driver {
	label: string;
	settings: Record<string, unknown>;
	price: Price;
	run(prompt: string, image: Buffer | null, server: Awaited<ReturnType<typeof openServer>>): Promise<Omit<RunRecord, "task" | "case" | "model" | "run" | "settings" | "share" | "costUsd" | "priceVerified" | "startedAt" | "ms">>;
}

function stripImages(x: unknown): unknown {
	return JSON.parse(
		JSON.stringify(x, (k, v) => (typeof v === "string" && v.length > 2000 && (k === "data" || k === "image_url") ? `<${v.length} chars>` : v)),
	);
}

function anthropicDriver(model: string, effort?: string): Driver {
	const client = new Anthropic();
	const price = ANTHROPIC_PRICES[model];
	if (!price) throw new Error(`no price for ${model}`);
	return {
		label: effort ? `${model}@${effort}` : model,
		settings: { vendor: "anthropic", model, thinking: "API default (adaptive)", effort: effort ?? "API default" },
		price,
		async run(prompt, image, server) {
			const tools: Anthropic.Tool[] = server.tools.map((t) => ({
				name: t.name,
				description: t.description,
				input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
			}));
			const system: Anthropic.TextBlockParam[] = [{ type: "text", text: systemPrompt(server.instructions), cache_control: { type: "ephemeral" } }];
			const content: Anthropic.ContentBlockParam[] = [];
			if (image) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: image.toString("base64") } });
			content.push({ type: "text", text: prompt });
			const messages: Anthropic.MessageParam[] = [{ role: "user", content }];
			const usage = zeroUsage();
			const calls: ToolCallRecord[] = [];
			let finalText = "";
			let stopReason: string | null = null;
			for (let turn = 0; turn < MAX_MODEL_TURNS; turn++) {
				const resp = await client.messages
					.stream({
						model,
						max_tokens: 32000,
						system,
						tools,
						messages,
						cache_control: { type: "ephemeral" },
						...(effort ? { output_config: { effort: effort as "low" | "medium" | "high" | "xhigh" | "max" } } : {}),
					})
					.finalMessage();
				usage.input += resp.usage.input_tokens;
				usage.output += resp.usage.output_tokens;
				usage.cacheRead += resp.usage.cache_read_input_tokens ?? 0;
				usage.cacheWrite += resp.usage.cache_creation_input_tokens ?? 0;
				stopReason = resp.stop_reason;
				messages.push({ role: "assistant", content: resp.content });
				const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
				if (text) finalText = text;
				const uses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
				if (resp.stop_reason !== "tool_use" || uses.length === 0) break;
				const results: Anthropic.ToolResultBlockParam[] = [];
				for (const use of uses) {
					if (calls.length >= MAX_TOOL_CALLS) {
						results.push({ type: "tool_result", tool_use_id: use.id, content: "Tool call limit reached for this eval.", is_error: true });
						continue;
					}
					const r = await server.call(use.name, use.input);
					calls.push({ tool: use.name, ok: !r.isError, input: use.input, result: r.text });
					results.push({ type: "tool_result", tool_use_id: use.id, content: r.text, ...(r.isError ? { is_error: true } : {}) });
				}
				messages.push({ role: "user", content: results });
				if (calls.length >= MAX_TOOL_CALLS && !calls.some((c) => c.ok)) break;
			}
			return { calls, finalText, stopReason, usage, transcript: stripImages(messages) as unknown[] };
		},
	};
}

// OpenAI Responses API over fetch (the openai package is not installed in this repo).
function openaiDriver(model: string, effort: string | null): Driver {
	const key = process.env.OPENAI_API_KEY;
	if (!key) throw new Error("OPENAI_API_KEY is not set");
	const price = openaiPrice(model);
	const settings: Record<string, unknown> = { vendor: "openai", model, reasoningEffort: effort ?? "none sent (Instant / chat model)" };
	return {
		label: effort ? `openai:${model}@${effort}` : `openai:${model}`,
		settings,
		price,
		async run(prompt, image, server) {
			const tools = server.tools.map((t) => {
				const { $schema: _s, ...parameters } = t.inputSchema as Record<string, unknown>;
				void _s;
				return { type: "function", name: t.name, description: t.description, parameters, strict: false };
			});
			const content: Record<string, unknown>[] = [];
			if (image) content.push({ type: "input_image", image_url: `data:image/png;base64,${image.toString("base64")}` });
			content.push({ type: "input_text", text: prompt });
			const input: Record<string, unknown>[] = [{ role: "user", content }];
			const usage = zeroUsage();
			const calls: ToolCallRecord[] = [];
			let finalText = "";
			let stopReason: string | null = null;
			let sentEffort = effort;
			for (let turn = 0; turn < MAX_MODEL_TURNS; turn++) {
				const body: Record<string, unknown> = { model, instructions: systemPrompt(server.instructions), input, tools, max_output_tokens: 32000 };
				if (sentEffort) body.reasoning = { effort: sentEffort };
				let res = await fetch(`${OPENAI_BASE}/responses`, {
					method: "POST",
					headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
					body: JSON.stringify(body),
				});
				// "none" is the newer models' no-reasoning setting, "minimal" the older ones'.
				if (res.status === 400 && sentEffort === "none") {
					sentEffort = "minimal";
					body.reasoning = { effort: sentEffort };
					res = await fetch(`${OPENAI_BASE}/responses`, {
						method: "POST",
						headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
						body: JSON.stringify(body),
					});
				}
				if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 500)}`);
				const resp = (await res.json()) as {
					status: string;
					output: { type: string; call_id?: string; name?: string; arguments?: string; content?: { type: string; text?: string }[] }[];
					usage?: { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number } };
				};
				const cached = resp.usage?.input_tokens_details?.cached_tokens ?? 0;
				usage.input += (resp.usage?.input_tokens ?? 0) - cached;
				usage.cacheRead += cached;
				usage.output += resp.usage?.output_tokens ?? 0;
				stopReason = resp.status;
				input.push(...(resp.output as Record<string, unknown>[]));
				const text = resp.output
					.filter((o) => o.type === "message")
					.flatMap((o) => o.content ?? [])
					.map((c) => c.text ?? "")
					.join("\n");
				if (text) finalText = text;
				const fcalls = resp.output.filter((o) => o.type === "function_call");
				if (fcalls.length === 0) break;
				for (const fc of fcalls) {
					let args: unknown = {};
					let parseError = false;
					try {
						args = JSON.parse(fc.arguments ?? "{}");
					} catch {
						parseError = true;
					}
					if (calls.length >= MAX_TOOL_CALLS) {
						input.push({ type: "function_call_output", call_id: fc.call_id, output: "Tool call limit reached for this eval." });
						continue;
					}
					const r = parseError ? { text: "The arguments were not valid JSON.", isError: true } : await server.call(fc.name ?? "", args);
					calls.push({ tool: fc.name ?? "", ok: !r.isError, input: args, result: r.text });
					input.push({ type: "function_call_output", call_id: fc.call_id, output: r.isError ? `Error: ${r.text}` : r.text });
				}
				if (calls.length >= MAX_TOOL_CALLS && !calls.some((c) => c.ok)) break;
			}
			// "none" falls back to "minimal" on models that predate it: record what was sent.
			settings.reasoningEffortSent = sentEffort;
			return { calls, finalText, stopReason, usage, transcript: stripImages(input) as unknown[] };
		},
	};
}

async function openaiAutoVariants(): Promise<Driver[]> {
	const key = process.env.OPENAI_API_KEY;
	if (!key) throw new Error("OPENAI_API_KEY is not set");
	const res = await fetch(`${OPENAI_BASE}/models`, { headers: { authorization: `Bearer ${key}` } });
	if (!res.ok) throw new Error(`OpenAI models ${res.status}`);
	const ids = ((await res.json()) as { data: { id: string }[] }).data.map((m) => m.id);
	const ver = (id: string) => Number(/^gpt-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? 0);
	const base = ids.filter((id) => /^gpt-\d+(\.\d+)?$/.test(id)).sort((a, b) => ver(b) - ver(a))[0];
	const instant = ids.filter((id) => /^gpt-\d+(\.\d+)?-chat-latest$/.test(id)).sort((a, b) => ver(b) - ver(a))[0];
	console.log(`OpenAI models: reasoning ${base ?? "—"}, instant ${instant ?? "—"}`);
	const out: Driver[] = [];
	if (instant) out.push(openaiDriver(instant, null));
	if (base) for (const e of ["none", "low", "medium", "high"]) out.push(openaiDriver(base, e));
	return out;
}

async function driversFor(spec: string): Promise<Driver[]> {
	if (spec === "openai:auto") return openaiAutoVariants();
	if (spec.startsWith("openai:")) {
		const [model, effort] = spec.slice(7).split("@");
		return [openaiDriver(model, effort ?? null)];
	}
	const [model, effort] = spec.split("@");
	return [anthropicDriver(model, effort)];
}

// ─── Checks ───────────────────────────────────────────────────────────────────

const PC: Record<string, number> = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
const SUFFIX_TONES: Record<string, number[]> = { "": [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus2: [0, 2, 7], sus4: [0, 5, 7] };
const OPEN_MIDI = [64, 59, 55, 50, 45, 40]; // strings[0] = high e

function parseChord(name: string): { root: number; tones: Set<number> } {
	const m = /^([A-G][#b]?)(.*)$/.exec(name)!;
	const root = PC[m[1]];
	return { root, tones: new Set((SUFFIX_TONES[m[2]] ?? [0, 4, 7]).map((i) => (root + i) % 12)) };
}

function fold<T>(xs: T[]): T[] {
	return xs.filter((x, i) => i === 0 || xs[i - 1] !== x);
}

function sequenceOk(got: string[], want: string[], order: "strict" | "set"): boolean {
	if (want.length === 0) return true;
	const f = fold(got);
	if (order === "set") return f[0] === want[0] && new Set(f).size === new Set(want).size && want.every((c) => f.includes(c));
	if (f.length < want.length) return false;
	// The last bar may fold into a cycle's first when the sequence repeats exactly.
	return f.every((c, i) => c === want[i % want.length]);
}

function bpmOk(got: number, want: ComposeCase["bpm"]): boolean | null {
	if (want === null) return null;
	if (typeof want === "number") return got === want;
	return got >= want.min && got <= want.max;
}

interface TabAnalysis {
	labels: string[];
	bassRootRate: number | null;
	toneFitRate: number | null;
	links: string[];
	spans: string[];
	bassOkRate: { travis: number | null; rootFifth: number | null };
}

function analyseTab(p: FingerpickPattern, chords: string[], shift = 0): TabAnalysis {
	const parsed = chords.map(parseChord);
	const labels: string[] = [];
	let bassHits = 0;
	let bassBars = 0;
	let fit = 0;
	let notesTotal = 0;
	const links = new Set<string>();
	const beat = p.timeSignature[1] === 8 && p.timeSignature[0] % 3 === 0 ? 36 : 96 / p.timeSignature[1];
	const beatsPerBar = p.timeSignature[1] === 8 && p.timeSignature[0] % 3 === 0 ? p.timeSignature[0] / 3 : p.timeSignature[0];
	let travisOk = 0;
	let rootFifthOk = 0;
	let bassBarsAll = 0;
	for (const m of p.measures) {
		let tick = 0;
		const notes: { tick: number; midi: number; string: number }[] = [];
		for (const slot of m.slots) {
			slot.strings.forEach((s, i) => {
				if (s.fret !== null && !s.muted && !slot.isRest) notes.push({ tick, midi: OPEN_MIDI[i] + s.fret - shift, string: i });
				if (s.link?.kind) links.add(s.link.kind);
			});
			tick += DURATION_TICKS[slot.duration];
		}
		if (notes.length > 0) {
			// The thumb: the lowest note on strings 4–6 (index 3–5) at each beat.
			const bassAt = (t: number) => {
				const low = notes.filter((n) => n.tick === t && n.string >= 3);
				return low.length ? low.reduce((a, b) => (a.midi <= b.midi ? a : b)) : null;
			};
			const beats = Array.from({ length: beatsPerBar }, (_, k) => bassAt(k * beat));
			bassBarsAll++;
			if (beats.every((b) => b) && new Set(beats.map((b) => b!.string)).size >= 2) travisOk++;
		}
		if (chords.length === 0 || notes.length === 0) continue;
		const atOne = notes.filter((n) => n.tick === 0);
		const bass = atOne.length ? Math.min(...atOne.map((n) => n.midi)) % 12 : null;
		let best = 0;
		let bestScore = -1;
		parsed.forEach((c, ci) => {
			const f = notes.filter((n) => c.tones.has(n.midi % 12)).length / notes.length;
			const s = f + (bass === c.root ? 0.25 : 0);
			if (s > bestScore) {
				bestScore = s;
				best = ci;
			}
		});
		labels.push(chords[best]);
		// Root and fifth: the bass on beat 1 is the root, and the thumb also plays the fifth in the bar.
		const onsets = [...new Set(notes.map((n) => n.tick))];
		const bassPcs = onsets
			.map((t) => notes.filter((n) => n.tick === t && n.string >= 3))
			.filter((xs) => xs.length)
			.map((xs) => Math.min(...xs.map((n) => n.midi)) % 12);
		if (bass === parsed[best].root && bassPcs.includes((parsed[best].root + 7) % 12)) rootFifthOk++;
		bassBars++;
		if (bass === parsed[best].root) bassHits++;
		fit += notes.filter((n) => parsed[best].tones.has(n.midi % 12)).length;
		notesTotal += notes.length;
	}
	return {
		labels,
		bassRootRate: bassBars ? bassHits / bassBars : null,
		toneFitRate: notesTotal ? fit / notesTotal : null,
		links: [...links],
		spans: [...new Set((p.spans ?? []).map((s) => s.kind))],
		bassOkRate: { travis: bassBarsAll ? travisOk / bassBarsAll : null, rootFifth: bassBars ? rootFifthOk / bassBars : null },
	};
}

type Checks = Record<string, boolean | number | string | null | string[]>;

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function checkCompose(c: ComposeCase, share: SharedItem | null, finalText: string, calls: ToolCallRecord[] = []): Checks {
	if (!share) return {};
	if (c.task === "tab") {
		if (share.kind !== "fingerpick") return { wrongKind: true };
		const p = share.pattern;
		// With a capo asked for and no capo field on propose_tab, frets written from the nut
		// (the shapes moved up by the capo) are as right as shape frets: take the better reading.
		let a = analyseTab(p, c.chords);
		let shifted = false;
		if (c.capo && !sequenceOk(a.labels, c.chords, c.chordOrder)) {
			const b = analyseTab(p, c.chords, c.capo);
			if (sequenceOk(b.labels, c.chords, c.chordOrder)) {
				a = b;
				shifted = true;
			}
		}
		const checks: Checks = {
			meter: c.meter ? p.timeSignature[0] === c.meter[0] && p.timeSignature[1] === c.meter[1] : null,
			bpm: bpmOk(p.bpm, c.bpm),
			gotBpm: p.bpm,
			gotMeter: `${p.timeSignature[0]}/${p.timeSignature[1]}`,
			bars: p.measures.length,
			chords: c.chords.length ? sequenceOk(a.labels, c.chords, c.chordOrder) : null,
			chordLabels: a.labels,
			bassRootRate: a.bassRootRate,
			bassRoot: a.bassRootRate === null ? null : a.bassRootRate >= 0.75,
			toneFitRate: a.toneFitRate,
			toneFit: a.toneFitRate === null ? null : a.toneFitRate >= 0.8,
			links: a.links,
			spans: a.spans,
		};
		if (c.bass) checks.thumb = (a.bassOkRate[c.bass] ?? 0) >= 0.75;
		if (c.bars !== undefined) checks.form = p.measures.length === c.bars && Object.entries(c.barChords ?? {}).every(([i, ch]) => a.labels[Number(i)] === ch);
		if (c.techniques) {
			checks.techniques =
				(c.techniques.links ?? []).every((k) => a.links.includes(k)) && (c.techniques.spans ?? []).every((k) => a.spans.includes(k));
		}
		if (c.capo) {
			// propose_tab has no capo field: the best a model can do is say so.
			checks.capoStored = patternCapo(p) === c.capo;
			checks.capoMentioned = /capo/i.test(finalText);
			checks.writtenFromNut = shifted;
		}
		return checks;
	}
	if (share.kind !== "strum") return { wrongKind: true };
	const strumCalls = calls.filter((x) => x.ok && x.tool === "propose_strum");
	const allChords = strumCalls.flatMap((x) => ((x.input as { chords?: string[] }).chords ?? []));
	const prog = share.progressions[share.openIndex] ?? share.progressions[0];
	const chords = prog ? prog.bars.map((b) => (b.chord ? chordAbbreviation(b.chord) : b.unknownChord ?? "?")) : [];
	// The stored first bar, cell by cell; patternNotation trims trailing blanks.
	const rhythm = (patternRhythm(share.pattern)[0] ?? []).map((b) => b.map((c) => (c === "" ? " " : c)).join("")).join("");
	const bpm = prog?.bpm ?? patternBpm(share.pattern);
	const meter = patternMeter(share.pattern);
	const capo = prog ? progressionCapo(prog) : 0;
	return {
		meter: c.meter ? meter[0] === c.meter[0] && meter[1] === c.meter[1] : null,
		bpm: bpmOk(bpm, c.bpm),
		gotBpm: bpm,
		chords: sequenceOk(chords, c.chords, c.chordOrder),
		gotChords: chords,
		capo: c.capo === undefined ? (capo === 0 ? null : false) : capo === c.capo,
		gotCapo: capo,
		rhythm: c.rhythm ? c.rhythm.test(rhythm) : null,
		gotRhythm: rhythm,
		// One link with the whole form, or the form split over several links in order (counted, see links).
		form: c.exactBars ? sameList(chords, c.exactBars) || sameList(allChords, c.exactBars) : null,
		links: strumCalls.length,
		meterDisclosed: c.meterUnsupported ? /4\/4/.test(finalText) : null,
	};
}

/** The fraction of a case's applicable pass/fail checks that pass. */
const SCORED_CHECKS = ["meter", "bpm", "chords", "bassRoot", "toneFit", "techniques", "capo", "rhythm", "thumb", "form", "meterDisclosed"];
function taskScore(checks: Checks): number | null {
	const vals = SCORED_CHECKS.map((k) => checks[k]).filter((v): v is boolean => typeof v === "boolean");
	return vals.length ? vals.filter(Boolean).length / vals.length : null;
}

// ─── Running ──────────────────────────────────────────────────────────────────

function runPath(task: Task, model: string, caseId: string, run: number) {
	return path.join(RUNS_DIR, task, model.replace(/[^A-Za-z0-9.@_-]/g, "_"), `${caseId}.r${run}.json`);
}

function allRecords(): RunRecord[] {
	if (!fs.existsSync(RUNS_DIR)) return [];
	const out: RunRecord[] = [];
	const walk = (d: string) => {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith(".json")) out.push(JSON.parse(fs.readFileSync(p, "utf8")));
		}
	};
	walk(RUNS_DIR);
	return out;
}

async function runAll(args: Map<string, string>) {
	const tasks = (args.get("task") ?? "tab,strum,read").split(",") as Task[];
	const specs = (args.get("models") ?? "claude-haiku-5-5").split(",");
	const runs = Number(args.get("runs") ?? 3);
	const maxUsd = Number(args.get("max-usd") ?? 15);
	const concurrency = Number(args.get("concurrency") ?? 4);
	const onlyCases = args.get("cases")?.split(",");
	let spent = allRecords().reduce((s, r) => s + r.costUsd, 0);
	console.log(`spent so far: $${spent.toFixed(3)}; cap $${maxUsd}`);

	const drivers = (await Promise.all(specs.map(driversFor))).flat();
	const cases: (ComposeCase | ReadCase)[] = [
		...(tasks.includes("tab") ? TAB_CASES : []),
		...(tasks.includes("strum") ? STRUM_CASES : []),
		...(tasks.includes("read") ? READ_CASES : []),
	].filter((c) => !onlyCases || onlyCases.includes(c.id));

	const jobs: (() => Promise<void>)[] = [];
	for (const d of drivers)
		for (const c of cases)
			for (let r = 1; r <= runs; r++) {
				const out = runPath(c.task, d.label, c.id, r);
				if (fs.existsSync(out)) continue;
				jobs.push(async () => {
					if (spent >= maxUsd) {
						console.log(`skip ${d.label} ${c.id} r${r}: budget reached`);
						return;
					}
					const image = c.task === "read" ? fs.readFileSync(path.join(GOLD_ROOT, c.set, "crops", `${c.exercise}.png`)) : null;
					const server = await openServer();
					const started = Date.now();
					let rec: RunRecord;
					try {
						const res = await d.run(c.prompt, image, server);
						const kind = c.task === "strum" ? "strum" : "fingerpick";
						const okShare = [...server.shares].reverse().find((x) => x.kind === kind) ?? null;
						const costUsd = costOf(res.usage, d.price);
						rec = {
							task: c.task, case: c.id, model: d.label, run: r, settings: d.settings, ...res,
							share: okShare, costUsd, priceVerified: d.price.verified, startedAt: new Date(started).toISOString(), ms: Date.now() - started,
						};
					} catch (error) {
						console.error(`error ${d.label} ${c.id} r${r}:`, (error as Error).message);
						await server.close();
						return; // not written: a rerun retries it
					}
					await server.close();
					spent += rec.costUsd;
					fs.mkdirSync(path.dirname(out), { recursive: true });
					fs.writeFileSync(out, JSON.stringify(rec, null, 1));
					const v = verdict(rec);
					console.log(`${d.label.padEnd(20)} ${c.id.padEnd(28)} r${r} ${v.padEnd(12)} calls ${rec.calls.map((x) => `${x.tool}:${x.ok ? "ok" : "err"}`).join(",") || "none"}  $${rec.costUsd.toFixed(3)}  total $${spent.toFixed(2)}`);
				});
			}
	console.log(`${jobs.length} runs to do`);
	let i = 0;
	await Promise.all(
		Array.from({ length: concurrency }, async () => {
			while (i < jobs.length) await jobs[i++]();
		}),
	);
	console.log(`done; spent $${spent.toFixed(3)}`);
}

function verdict(r: RunRecord): "first" | "repair" | "failed" | "wrong-tool" | "no-call" {
	const want = EXPECTED_TOOL[r.task];
	if (r.calls.length === 0) return "no-call";
	if (r.calls[0].tool === want && r.calls[0].ok) return "first";
	if (r.calls.some((c) => c.tool === want && c.ok)) return "repair";
	if (r.calls.some((c) => c.ok)) return "wrong-tool";
	return "failed";
}

// ─── Report ───────────────────────────────────────────────────────────────────

const pct = (x: number | null | undefined) => (x === null || x === undefined || Number.isNaN(x) ? "—" : `${Math.round(x * 100)}%`);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function scoreReads(records: RunRecord[]) {
	const byCase = new Map<string, RunRecord[]>();
	for (const r of records) byCase.set(r.case, [...(byCase.get(r.case) ?? []), r]);
	const scores = new Map<RunRecord, { metrics: Record<string, number>; differences: string[] }>();
	for (const [caseId, rs] of byCase) {
		const c = READ_CASES.find((x) => x.id === caseId)!;
		const job = {
			gold: path.join(GOLD_ROOT, c.set, `${c.exercise}.json`),
			readings: rs.map((r, i) => ({ key: String(i), pattern: r.share && r.share.kind === "fingerpick" ? r.share.pattern : null })),
		};
		const py = spawnSync(PYTHON, ["-I", path.join(HERE, "score_read.py")], { input: JSON.stringify(job), encoding: "utf8" });
		if (py.status !== 0) throw new Error(py.stderr);
		const out = JSON.parse(py.stdout) as Record<string, { metrics: Record<string, number>; differences: string[] }>;
		rs.forEach((r, i) => scores.set(r, out[String(i)]));
	}
	return scores;
}

function report() {
	const records = allRecords();
	const lines: string[] = [];
	const models = [...new Set(records.map((r) => r.model))].sort();
	const spendBy = (rs: RunRecord[]) => rs.reduce((s, r) => s + r.costUsd, 0);
	lines.push(`Total spend: $${spendBy(records).toFixed(2)} over ${records.length} runs.`, "");

	for (const task of ["tab", "strum"] as const) {
		const probes = new Set(STRUM_CASES.filter((c) => c.meterUnsupported).map((c) => c.id));
		const rs = records.filter((r) => r.task === task && !probes.has(r.case));
		if (!rs.length) continue;
		const cases = (task === "tab" ? TAB_CASES : STRUM_CASES).filter((c) => !probes.has(c.id));
		lines.push(`### ${task === "tab" ? "Compose a fingerpicking tab (propose_tab)" : "Compose a strumming pattern (propose_strum)"}`, "");
		const extra = task === "tab" ? ["meter", "bpm", "chords", "bass root b.1", "tone fit", "thumb pattern", "form", "techniques"] : ["bpm", "chords", "capo", "rhythm asked", "form", "says 4/4"];
		lines.push(`| model | n | valid 1st try | valid after repair | failed / no call | calls/run | task score | ${extra.join(" | ")} | spend |`);
		lines.push(`|---|---|---|---|---|---|---|${extra.map(() => "---|").join("")}---|`);
		for (const m of models) {
			const mr = rs.filter((r) => r.model === m);
			if (!mr.length) continue;
			const v = mr.map(verdict);
			const withChecks = mr.map((r) => ({ r, ch: checkCompose(cases.find((c) => c.id === r.case)!, r.share, r.finalText, r.calls) }));
			const rate = (k: string) => {
				const vals = withChecks.map((x) => x.ch[k]).filter((x): x is boolean => typeof x === "boolean");
				// a failed run counts as failing every check it was owed
				const owed = withChecks.filter((x) => !x.r.share && caseOwes(cases.find((c) => c.id === x.r.case)!, k)).length;
				return vals.length + owed ? `${pct(vals.filter(Boolean).length / (vals.length + owed))} (${vals.length + owed})` : "—";
			};
			const scores = withChecks.map((x) => (x.r.share ? taskScore(x.ch) ?? 0 : 0));
			const cols = task === "tab" ? ["meter", "bpm", "chords", "bassRoot", "toneFit", "thumb", "form", "techniques"].map(rate) : ["bpm", "chords", "capo", "rhythm", "form", "meterDisclosed"].map(rate);
			lines.push(
				`| ${m} | ${mr.length} | ${v.filter((x) => x === "first").length} | ${v.filter((x) => x === "repair").length} | ${v.filter((x) => x !== "first" && x !== "repair").length} | ${mean(mr.map((r) => r.calls.length)).toFixed(1)} | ${pct(mean(scores))} | ${cols.join(" | ")} | $${spendBy(mr).toFixed(2)} |`,
			);
		}
		lines.push("");
		// Per case, passes of 3
		lines.push(`Per case (runs fully correct = valid and every applicable check passed):`, "");
		lines.push(`| case | ${models.filter((m) => rs.some((r) => r.model === m)).join(" | ")} |`);
		lines.push(`|---|${models.filter((m) => rs.some((r) => r.model === m)).map(() => "---|").join("")}`);
		for (const c of cases) {
			const cells = models
				.filter((m) => rs.some((r) => r.model === m))
				.map((m) => {
					const mr = rs.filter((r) => r.model === m && r.case === c.id);
					const good = mr.filter((r) => r.share && taskScore(checkCompose(c, r.share, r.finalText, r.calls)) === 1).length;
					return mr.length ? `${good}/${mr.length}` : "—";
				});
			lines.push(`| ${c.id} | ${cells.join(" | ")} |`);
		}
		lines.push("", "Runs that missed a check:", "");
		for (const r of rs) {
			const c = cases.find((x) => x.id === r.case)!;
			const ch = checkCompose(c, r.share, r.finalText, r.calls);
			const failed = SCORED_CHECKS.filter((k) => ch[k] === false || (!r.share && caseOwes(c, k)));
			if (!failed.length) continue;
			const got = Object.entries(ch).filter(([k]) => k.startsWith("got") || k === "chordLabels" || k === "bars" || k === "links").map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ");
			lines.push(`- ${r.model} ${r.case} r${r.run}: failed ${failed.join(", ")} (${got})`);
		}
		lines.push("");
	}

	const probeRuns = records.filter((r) => STRUM_CASES.some((c) => c.meterUnsupported && c.id === r.case));
	if (probeRuns.length) {
		lines.push("### Probe: a 6/8 strum (propose_strum writes 4/4 only; not in the task scores above)", "");
		lines.push("| model | n | reply says the strum tool is 4/4-only | wrote a 6/8 tab instead | wrote a 4/4 strum | no link |");
		lines.push("|---|---|---|---|---|---|");
		for (const m of models) {
			const mr = probeRuns.filter((r) => r.model === m);
			if (!mr.length) continue;
			const tabbed = mr.filter((r) => r.calls.some((c) => c.ok && c.tool === "propose_tab")).length;
			const strummed = mr.filter((r) => r.calls.some((c) => c.ok && c.tool === "propose_strum")).length;
			lines.push(`| ${m} | ${mr.length} | ${mr.filter((r) => /4\/4/.test(r.finalText)).length} | ${tabbed} | ${strummed} | ${mr.filter((r) => !r.calls.some((c) => c.ok)).length} |`);
		}
		lines.push("");
	}
	const reads = records.filter((r) => r.task === "read");
	if (reads.length) {
		const scores = scoreReads(reads);
		lines.push("### Read a tab image (import_tab), scored by book-service/evals/tab/score.py", "");
		const keys = ["note_f1", "note_precision", "note_recall", "fret_f1", "rhythm", "link_f1", "effect_f1", "span_f1", "pick_down_f1", "hammer_f1", "tie_f1", "slide_f1", "vibrato_f1", "palm_mute_f1", "chords_placed", "bars"];
		lines.push(`| case | model | n | valid 1st try | valid after repair | failed | ${keys.join(" | ")} | spend |`);
		lines.push(`|---|---|---|---|---|---|${keys.map(() => "---|").join("")}---|`);
		for (const caseId of [...new Set(reads.map((r) => r.case))]) for (const m of models) {
			const mr = reads.filter((r) => r.model === m && r.case === caseId);
			if (!mr.length) continue;
			const v = mr.map(verdict);
			const cols = keys.map((k) => {
				const vals = mr.map((r) => scores.get(r)?.metrics[k]).filter((x): x is number => typeof x === "number");
				const per = mr.map((r) => scores.get(r)?.metrics[k]);
				return `${pct(mean(vals))}${vals.length > 1 ? ` [${per.map((x) => (typeof x === "number" ? Math.round(x * 100) : "—")).join("/")}]` : ""}`;
			});
			lines.push(`| ${caseId} | ${m} | ${mr.length} | ${v.filter((x) => x === "first").length} | ${v.filter((x) => x === "repair").length} | ${v.filter((x) => x !== "first" && x !== "repair").length} | ${cols.join(" | ")} | $${spendBy(mr).toFixed(2)} |`);
		}
		lines.push("");
		for (const r of reads) {
			const s = scores.get(r);
			lines.push(`- ${r.case} ${r.model} r${r.run}: ${verdict(r)} (${r.calls.map((c) => `${c.tool}:${c.ok ? "ok" : "err"}`).join(",") || "no call"}); ${s ? `${s.differences.length} differences${s.differences.length ? `: ${s.differences.slice(0, 8).join("; ")}` : ""}` : "no score"}`);
		}
		lines.push("");
	}

	// Errors the models were sent back, for the record
	lines.push("### Tool errors returned to the models (first line of each)", "");
	for (const r of records)
		for (const c of r.calls.filter((x) => !x.ok))
			lines.push(`- ${r.model} ${r.case} r${r.run} ${c.tool}: ${c.result.split("\n").slice(0, 2).join(" ").slice(0, 220)}`);
	const out = lines.join("\n");
	fs.mkdirSync(RUNS_DIR, { recursive: true });
	fs.writeFileSync(path.join(RUNS_DIR, "results.md"), out);
	console.log(out);
}

function caseOwes(c: ComposeCase, k: string): boolean {
	switch (k) {
		case "meter":
			return c.meter !== null;
		case "bpm":
			return c.bpm !== null;
		case "chords":
		case "bassRoot":
		case "toneFit":
			return c.chords.length > 0;
		case "techniques":
			return !!c.techniques;
		case "capo":
			return c.capo !== undefined;
		case "rhythm":
			return !!c.rhythm;
		case "thumb":
			return !!c.bass;
		case "form":
			return c.bars !== undefined || !!c.exactBars;
		case "meterDisclosed":
			return !!c.meterUnsupported;
	}
	return false;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2);
const args = new Map<string, string>();
for (let i = 0; i < rest.length; i += 2) args.set(rest[i].replace(/^--/, ""), rest[i + 1]);
if (cmd === "run") await runAll(args);
else if (cmd === "report") report();
else if (cmd === "tools") {
	const s = await openServer();
	console.log(JSON.stringify({ instructions: s.instructions, tools: s.tools }, null, 1));
	await s.close();
} else console.log("usage: run.ts run|report|tools [--task tab,strum,read] [--models a,b] [--runs 3] [--max-usd 15] [--cases id,id]");
