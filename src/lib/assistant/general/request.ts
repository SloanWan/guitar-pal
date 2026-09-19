import type Anthropic from "@anthropic-ai/sdk";
import { GENERAL_SYSTEM_PROMPT } from "@/lib/assistant/general/prompt";
import { TOOLS } from "@/lib/assistant/general/tools";
import type { Lang } from "@/lib/assistant/lang";

/**
 * One model call's parameters, built the same way for the route and the
 * eval runner so the two never measure different requests.
 *
 * The prefix — tools, then the system prompt — is byte-stable across calls
 * and carries the cache breakpoint. Everything per-player rides on the turn's
 * own user message, after the breakpoint.
 */

/** The orchestrator model; `ASSISTANT_MODEL` overrides it for the eval runs that pick it. */
export const DEFAULT_MODEL = "claude-sonnet-5";
export const MODEL = process.env.ASSISTANT_MODEL || DEFAULT_MODEL;

/** Text and at most a few tool calls: a large cap would only widen the blast radius. */
export const MAX_OUTPUT_TOKENS = 2048;

/** What the model is told about this player and this moment. */
export interface GeneralContext {
	/** The page the panel is open on, when it is one with a workspace. */
	page: "strum" | "tab" | null;
	strumNames: readonly string[];
	tabNames: readonly string[];
	/** The interface language — what to answer in when the message itself does not say. */
	lang: Lang;
}

export function contextBlock(context: GeneralContext): string {
	const names = (list: readonly string[]) => (list.length === 0 ? "none" : list.map((n) => `"${n}"`).join(", "));
	return [
		"[context]",
		`page: ${context.page === "strum" ? "strumming machine" : context.page === "tab" ? "fingerpicking editor" : "elsewhere"}`,
		`strumming patterns the player has: ${names(context.strumNames)}`,
		`fingerpicking patterns the player has: ${names(context.tabNames)}`,
		`interface language: ${context.lang}`,
		"[/context]",
	].join("\n");
}

/**
 * The context goes on the newest user message that carries text — the one
 * that started this turn — so a loop's later calls, which append tool
 * results, leave the prefix untouched.
 */
export function withContext(messages: readonly Anthropic.MessageParam[], context: GeneralContext): Anthropic.MessageParam[] {
	const out = messages.map((m) => ({ ...m }));
	for (let i = out.length - 1; i >= 0; i--) {
		const m = out[i];
		if (m.role !== "user") continue;
		if (typeof m.content === "string") {
			out[i] = { role: "user", content: [{ type: "text", text: contextBlock(context) }, { type: "text", text: m.content }] };
			return out;
		}
		if (m.content.some((b) => b.type === "text")) {
			out[i] = { role: "user", content: [{ type: "text", text: contextBlock(context) }, ...m.content] };
			return out;
		}
	}
	return out;
}

/**
 * Thinking and effort are per model. The orchestrator's job is short —
 * pick a tool, say a sentence — so thinking is off where the model allows
 * it and effort is low where the model takes one.
 */
function reasoningParams(model: string): Pick<Anthropic.MessageCreateParams, "thinking" | "output_config"> {
	if (model.startsWith("claude-haiku-4-5")) return {};
	if (model.startsWith("claude-opus-5") || model.startsWith("claude-fable")) {
		return { thinking: { type: "adaptive" }, output_config: { effort: "low" } };
	}
	return { thinking: { type: "disabled" }, output_config: { effort: "low" } };
}

export function buildGeneralRequest(
	model: string,
	messages: readonly Anthropic.MessageParam[],
	context: GeneralContext,
): Anthropic.MessageCreateParamsNonStreaming {
	return {
		model,
		max_tokens: MAX_OUTPUT_TOKENS,
		// Rendered tools → system → messages, so the breakpoint on the system
		// block covers the tools before it.
		system: [{ type: "text", text: GENERAL_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
		tools: [...TOOLS],
		...reasoningParams(model),
		messages: withContext(messages, context),
	};
}
