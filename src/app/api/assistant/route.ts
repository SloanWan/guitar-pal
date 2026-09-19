import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServer } from "@/lib/supabase-server";
import { callGeneral } from "@/lib/assistant/general/model";
import { MODEL, type GeneralContext } from "@/lib/assistant/general/request";
import { isToolName } from "@/lib/assistant/general/tools";
import { SlidingWindowLimiter } from "@/lib/assistant/rateLimit";
import type { AssistantErrorBody } from "@/lib/assistant/types";

/**
 * The General assistant's model step. One call in, one model reply out;
 * the client runs the tools and comes back with their results, so the
 * route holds no state and every request is the whole exchange so far.
 * Only the General mode reaches here — Strum and Tab read by rules and
 * never cost an API call.
 *
 * Abuse controls, in order of how much they actually matter:
 *  1. A signed-in user is required. An open LLM endpoint is a free proxy for
 *     anyone who finds it, and that is how a side project gets a large bill.
 *  2. Per-user rate limiting, per model call (see rateLimit.ts for its
 *     in-process caveat). A turn is at most three calls, so this is a dozen
 *     turns an hour.
 *  3. Hard caps on messages, text length and output tokens; tool blocks only
 *     for the tools this app has.
 */

/** Text turns and tool round trips together — a long thread plus a three-call turn. */
const MAX_MESSAGES = 30;
const MAX_CHARS_PER_TEXT = 600;
/** A tool result is one line from the app; anything longer was not written by it. */
const MAX_CHARS_PER_RESULT = 1000;
const MAX_NAMES = 100;
const MAX_NAME_CHARS = 80;

const limiter = new SlidingWindowLimiter({ limit: 40, windowMs: 60 * 60 * 1000 });

function json(body: unknown, status: number, headers?: HeadersInit): Response {
	return Response.json(body, { status, headers });
}

function error(message: string, status: number, retryAfterSeconds?: number): Response {
	const body: AssistantErrorBody = { error: message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) };
	return json(body, status, retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined);
}

type Block = Record<string, unknown>;

function isRecord(value: unknown): value is Block {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_CHARS_PER_TEXT;
}

/** A content block the client is allowed to send: its own text, the model's tool use echoed back, a tool result. */
function blockError(block: unknown, role: "user" | "assistant"): string | null {
	if (!isRecord(block)) return "each content block must be an object.";
	switch (block.type) {
		case "text":
			return isText(block.text) ? null : `text blocks need text under ${MAX_CHARS_PER_TEXT} characters.`;
		case "tool_use":
			if (role !== "assistant") return "tool_use belongs to the assistant.";
			if (typeof block.id !== "string" || !isToolName(block.name) || !isRecord(block.input)) return "tool_use needs an id, a known tool name and an input object.";
			return null;
		case "tool_result":
			if (role !== "user") return "tool_result belongs to the user.";
			if (typeof block.tool_use_id !== "string") return "tool_result needs a tool_use_id.";
			if (typeof block.content !== "string" || block.content.length > MAX_CHARS_PER_RESULT) return `tool_result content must be a string under ${MAX_CHARS_PER_RESULT} characters.`;
			if (block.is_error !== undefined && typeof block.is_error !== "boolean") return "is_error must be a boolean.";
			return null;
		default:
			return `content blocks of type ${String(block.type)} are not accepted.`;
	}
}

function messageError(value: unknown): string | null {
	if (!isRecord(value)) return "each message must be an object.";
	if (value.role !== "user" && value.role !== "assistant") return "each message needs a role of user or assistant.";
	if (typeof value.content === "string") return isText(value.content) ? null : `keep each message under ${MAX_CHARS_PER_TEXT} characters and not empty.`;
	if (!Array.isArray(value.content) || value.content.length === 0) return "content must be text or a non-empty array of blocks.";
	for (const block of value.content) {
		const e = blockError(block, value.role);
		if (e) return e;
	}
	return null;
}

function readMessages(body: Block): Anthropic.MessageParam[] | string {
	const messages = body.messages;
	if (!Array.isArray(messages) || messages.length === 0) return "messages must be a non-empty array.";
	if (messages.length > MAX_MESSAGES) return `Keep the conversation to ${MAX_MESSAGES} messages.`;
	for (const m of messages) {
		const e = messageError(m);
		if (e) return e;
	}
	const turns = messages as Anthropic.MessageParam[];
	if (turns[turns.length - 1].role !== "user") return "The last message must be from the user.";
	return turns;
}

function readNames(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.length > MAX_NAMES) return null;
	return value.every((n) => typeof n === "string" && n.length <= MAX_NAME_CHARS) ? (value as string[]) : null;
}

function readContext(body: Block): GeneralContext | string {
	const c = body.context;
	if (!isRecord(c)) return "context must be an object.";
	const page = c.page === "strum" || c.page === "tab" ? c.page : c.page === null || c.page === undefined ? null : "bad";
	if (page === "bad") return "context.page must be strum, tab or null.";
	const strumNames = readNames(c.strumNames ?? []);
	const tabNames = readNames(c.tabNames ?? []);
	if (!strumNames || !tabNames) return `context names must be short strings, at most ${MAX_NAMES}.`;
	const lang = c.lang === "zh" ? "zh" : "en";
	return { page, strumNames, tabNames, lang };
}

export async function POST(request: Request): Promise<Response> {
	if (!process.env.ANTHROPIC_API_KEY) {
		return error("The assistant is not configured on this deployment (ANTHROPIC_API_KEY is unset).", 503);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return error("Body was not valid JSON.", 400);
	}
	if (!isRecord(body)) return error("Expected a JSON object.", 400);

	const messages = readMessages(body);
	if (typeof messages === "string") return error(messages, 400);
	const context = readContext(body);
	if (typeof context === "string") return error(context, 400);

	const supabase = await createSupabaseServer();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) {
		return error("Sign in to use the General assistant. Strum and Tab work signed out.", 401);
	}

	const verdict = limiter.check(user.id);
	if (!verdict.allowed) {
		return error("You have used the assistant a lot in the last hour. Try again shortly.", 429, verdict.retryAfterSeconds);
	}

	const client = new Anthropic();
	try {
		const { step, attempt, latencyMs } = await callGeneral(client, MODEL, messages, context);
		const tools = step.content.filter((b) => b.type === "tool_use").map((b) => (b.type === "tool_use" ? b.name : "")).join(",");
		// One line per model call, with everything a cost-per-call figure needs.
		console.info(
			`[assistant] user=${user.id} model=${MODEL} stop=${attempt.stopReason} tools=${tools || "-"} in=${attempt.inputTokens} out=${attempt.outputTokens} cache_read=${attempt.cacheReadTokens} cache_write=${attempt.cacheWriteTokens} latency_ms=${latencyMs}`,
		);
		return json(step, 200);
	} catch (e) {
		if (e instanceof Anthropic.RateLimitError) {
			return error("The assistant is busy. Try again in a moment.", 429);
		}
		if (e instanceof Anthropic.AuthenticationError) {
			return error("The assistant is misconfigured on this deployment.", 503);
		}
		console.error("[assistant] model call failed:", e);
		return error("The assistant could not be reached.", 502);
	}
}
