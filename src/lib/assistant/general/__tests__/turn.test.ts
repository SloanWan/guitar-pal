import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { resolveGeneralTurn, type ModelStep } from "@/lib/assistant/general/turn";
import type { ToolExecution } from "@/lib/assistant/general/execute";
import type { GeneralContext } from "@/lib/assistant/general/request";
import type { AssistantProposal } from "@/lib/assistant/types";

const ctx: GeneralContext = { page: null, strumNames: [], tabNames: [], lang: "en" };

const text = (t: string): Anthropic.TextBlock => ({ type: "text", text: t, citations: null });
const use = (id: string, name: string, input: unknown): Anthropic.ToolUseBlock => ({ type: "tool_use", id, name, input });
const step = (content: Anthropic.ContentBlock[], stopReason: Anthropic.StopReason = "end_turn"): ModelStep => ({ content, stopReason });

const proposal = { kind: "pattern", name: "x", rhythm: "D DU UD", bars: [], bpm: null, capo: null, chords: [], warnings: { unresolvedChords: [], rhythmGuessed: false, padded: false, fellBackToDeterministic: false } } as unknown as AssistantProposal;
const made: ToolExecution = { result: "Made it.", isError: false, card: { domain: "strum", proposal }, text: "Read straight from what you typed." };
const missed: ToolExecution = { result: "Nothing read.", isError: true };

/** A model that answers each call from a script, in order. */
function scripted(steps: ModelStep[]) {
	const calls: Anthropic.MessageParam[][] = [];
	const call = vi.fn(async (messages: readonly Anthropic.MessageParam[]) => {
		calls.push([...messages]);
		const next = steps.shift();
		if (!next) throw new Error("script ran out");
		return next;
	});
	return { call, calls };
}

describe("resolveGeneralTurn", () => {
	it("answers a question with no tool", async () => {
		const model = scripted([step([text("Try the Am pentatonic.")])]);
		const execute = vi.fn();
		const out = await resolveGeneralTurn({ text: "what scale over Am?", history: [], context: ctx, call: model.call, execute });
		expect(out).toMatchObject({ text: "Try the Am pentatonic.", calls: 1, toolsUsed: [], toolsFailed: false });
		expect(out.card).toBeUndefined();
		expect(execute).not.toHaveBeenCalled();
	});

	it("runs a tool, sends its result back, and keeps the card", async () => {
		const model = scripted([
			step([text("Reading that."), use("t1", "read_strum", { text: "C G Am F" })], "tool_use"),
			step([text("Here is your progression.")]),
		]);
		const execute = vi.fn(async () => made);
		const out = await resolveGeneralTurn({ text: "C G Am F", history: [], context: ctx, call: model.call, execute });
		expect(execute).toHaveBeenCalledWith("read_strum", { text: "C G Am F" });
		expect(out).toMatchObject({ text: "Here is your progression.", calls: 2, toolsUsed: ["read_strum"], toolsFailed: false });
		expect(out.card).toEqual(made.card);
		// The second call carries the assistant's tool use and the result, verbatim.
		const second = model.calls[1];
		expect(second[1]).toMatchObject({ role: "assistant" });
		expect(second[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "Made it.", is_error: false }] });
	});

	it("carries the thread's earlier turns as plain text", async () => {
		const model = scripted([step([text("ok")])]);
		await resolveGeneralTurn({
			text: "and faster",
			history: [{ role: "user", content: "C G" }, { role: "assistant", content: "Read it." }],
			context: ctx,
			call: model.call,
			execute: vi.fn(),
		});
		expect(model.calls[0]).toEqual([
			{ role: "user", content: "C G" },
			{ role: "assistant", content: "Read it." },
			{ role: "user", content: "and faster" },
		]);
	});

	it("reports a tool error back and lets the model try once more", async () => {
		const model = scripted([
			step([use("t1", "propose_strum", { name: "x", rhythm: "D Q", chords: [], bpm: 0 })], "tool_use"),
			step([use("t2", "propose_strum", { name: "x", rhythm: "D DU UD", chords: [], bpm: 0 })], "tool_use"),
			step([text("Fixed.")]),
		]);
		const execute = vi.fn().mockResolvedValueOnce(missed).mockResolvedValueOnce(made);
		const out = await resolveGeneralTurn({ text: "a strum", history: [], context: ctx, call: model.call, execute });
		expect(model.calls[1][2]).toMatchObject({ content: [{ is_error: true }] });
		expect(out).toMatchObject({ text: "Fixed.", calls: 3, toolsFailed: false });
		expect(out.card).toEqual(made.card);
	});

	it("stops at the call cap even if the model keeps asking for tools", async () => {
		const model = scripted([
			step([use("t1", "read_strum", { text: "x" })], "tool_use"),
			step([use("t2", "read_tab", { text: "x" })], "tool_use"),
			step([use("t3", "read_strum", { text: "x" })], "tool_use"),
			step([use("t4", "read_tab", { text: "x" })], "tool_use"),
			step([text("never reached")]),
		]);
		const execute = vi.fn(async () => missed);
		const out = await resolveGeneralTurn({ text: "x", history: [], context: ctx, call: model.call, execute });
		expect(out.calls).toBe(4);
		expect(out.toolsFailed).toBe(true);
		expect(out.text).toMatch(/couldn't make that/);
	});

	it("speaks the reader's line when the model says nothing after a tool", async () => {
		const model = scripted([step([use("t1", "read_strum", { text: "C G" })], "tool_use"), step([])]);
		const out = await resolveGeneralTurn({ text: "C G", history: [], context: ctx, call: model.call, execute: vi.fn(async () => made) });
		expect(out.text).toBe("Read straight from what you typed.");
		expect(out.card).toEqual(made.card);
	});

	it("answers in the player's language when nothing else is said", async () => {
		const model = scripted([step([use("t1", "read_strum", { text: "来一个" })], "tool_use"), step([])]);
		const out = await resolveGeneralTurn({ text: "来一个", history: [], context: ctx, call: model.call, execute: vi.fn(async () => missed) });
		expect(out.lang).toBe("zh");
		expect(out.text).toContain("没做出来");
	});

	it("refuses a tool it does not know, and bad input, without running anything", async () => {
		const model = scripted([
			step([use("t1", "delete_everything", {}), use("t2", "read_strum", { text: "" })], "tool_use"),
			step([text("Sorry.")]),
		]);
		const execute = vi.fn();
		await resolveGeneralTurn({ text: "x", history: [], context: ctx, call: model.call, execute });
		expect(execute).not.toHaveBeenCalled();
		const results = model.calls[1][2].content as Anthropic.ToolResultBlockParam[];
		expect(results.map((r) => r.is_error)).toEqual([true, true]);
		expect(results[0].content).toContain("no tool called");
	});

	it("survives a tool that throws", async () => {
		const model = scripted([step([use("t1", "read_strum", { text: "x" })], "tool_use"), step([text("Hm.")])]);
		const execute = vi.fn(async () => {
			throw new Error("boom");
		});
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const out = await resolveGeneralTurn({ text: "x", history: [], context: ctx, call: model.call, execute });
		spy.mockRestore();
		expect(out.text).toBe("Hm.");
		expect(out.toolsFailed).toBe(true);
	});
});
