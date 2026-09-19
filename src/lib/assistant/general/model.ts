import type Anthropic from "@anthropic-ai/sdk";
import { buildGeneralRequest, type GeneralContext } from "@/lib/assistant/general/request";
import type { ModelStep } from "@/lib/assistant/general/turn";

/**
 * One model step, server-side — the route's and the eval runner's, so the
 * two read the same request and the same numbers. SDK errors are not caught
 * here: the route maps them to statuses and the runner counts them.
 */

/** What one round trip cost, in the units the bill is written in. */
export interface ModelAttempt {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	stopReason: string | null;
}

export function attemptOf(response: Anthropic.Message): ModelAttempt {
	return {
		inputTokens: response.usage.input_tokens,
		outputTokens: response.usage.output_tokens,
		cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
		cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
		stopReason: response.stop_reason,
	};
}

export const REFUSAL_REPLY = "I can't help with that one. Ask me about playing, practice, or the patterns in this app.";

export interface CallGeneralResult {
	step: ModelStep;
	attempt: ModelAttempt;
	latencyMs: number;
}

export async function callGeneral(
	client: Anthropic,
	model: string,
	messages: readonly Anthropic.MessageParam[],
	context: GeneralContext,
): Promise<CallGeneralResult> {
	const started = Date.now();
	const response = await client.messages.create(buildGeneralRequest(model, messages, context));
	const step: ModelStep =
		response.stop_reason === "refusal"
			? { content: [{ type: "text", text: REFUSAL_REPLY, citations: null }], stopReason: "refusal", model: response.model }
			: { content: response.content, stopReason: response.stop_reason, model: response.model };
	return { step, attempt: attemptOf(response), latencyMs: Date.now() - started };
}
