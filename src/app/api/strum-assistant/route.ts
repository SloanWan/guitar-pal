import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServer } from "@/lib/supabase-server";
import { askModel } from "@/lib/strumAssistant/askModel";
import { SlidingWindowLimiter } from "@/lib/strumAssistant/rateLimit";
import type { AssistantTurn } from "@/lib/strumAssistant/types";

/**
 * The assistant's model path. Reached only when the client's deterministic
 * router could not read the request on its own, so a plain chord line or a
 * typed rhythm never costs an API call.
 *
 * Abuse controls, in order of how much they actually matter:
 *  1. A signed-in user is required. An open LLM endpoint is a free proxy for
 *     anyone who finds it, and that is how a side project gets a large bill.
 *  2. Per-user rate limiting (see rateLimit.ts for its in-process caveat).
 *  3. Hard caps on turns, input length and output tokens.
 */

const MAX_TURNS = 12;
const MAX_CHARS_PER_TURN = 600;

const limiter = new SlidingWindowLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });

function json(body: unknown, status: number, headers?: HeadersInit): Response {
	return Response.json(body, { status, headers });
}

function isTurn(value: unknown): value is AssistantTurn {
	if (typeof value !== "object" || value === null) return false;
	const turn = value as Record<string, unknown>;
	return (
		(turn.role === "user" || turn.role === "assistant") &&
		typeof turn.content === "string" &&
		turn.content.trim().length > 0
	);
}

function readTurns(body: unknown): AssistantTurn[] | string {
	if (typeof body !== "object" || body === null) return "Expected a JSON object.";
	const messages = (body as Record<string, unknown>).messages;
	if (!Array.isArray(messages) || messages.length === 0) return "messages must be a non-empty array.";
	if (messages.length > MAX_TURNS) return `Keep the conversation to ${MAX_TURNS} turns.`;
	if (!messages.every(isTurn)) return "Each message needs a role of user or assistant and text content.";
	const turns = messages as AssistantTurn[];
	if (turns[turns.length - 1].role !== "user") return "The last message must be from the user.";
	if (turns.some((t) => t.content.length > MAX_CHARS_PER_TURN)) {
		return `Keep each message under ${MAX_CHARS_PER_TURN} characters.`;
	}
	return turns;
}

export async function POST(request: Request): Promise<Response> {
	if (!process.env.ANTHROPIC_API_KEY) {
		return json(
			{ error: "The assistant is not configured on this deployment (ANTHROPIC_API_KEY is unset)." },
			503,
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Body was not valid JSON." }, 400);
	}

	const turns = readTurns(body);
	if (typeof turns === "string") return json({ error: turns }, 400);

	const supabase = await createSupabaseServer();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) {
		return json({ error: "Sign in to use the assistant. Typed chords and rhythms work signed out." }, 401);
	}

	const verdict = limiter.check(user.id);
	if (!verdict.allowed) {
		return json(
			{ error: "You have used the assistant a lot in the last hour. Try again shortly.", retryAfterSeconds: verdict.retryAfterSeconds },
			429,
			{ "Retry-After": String(verdict.retryAfterSeconds) },
		);
	}

	const client = new Anthropic();
	try {
		const result = await askModel(client, turns);
		// One line per request, with everything a cost-per-request figure needs.
		// The deterministic paths never reach here, so path is always the model's.
		const totals = result.attempts.reduce(
			(sum, a) => ({
				in: sum.in + a.inputTokens,
				out: sum.out + a.outputTokens,
				cacheRead: sum.cacheRead + a.cacheReadTokens,
				cacheWrite: sum.cacheWrite + a.cacheWriteTokens,
			}),
			{ in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
		);
		console.info(
			`[strum-assistant] user=${user.id} path=llm outcome=${result.outcome} attempts=${result.attempts.length} in=${totals.in} out=${totals.out} cache_read=${totals.cacheRead} cache_write=${totals.cacheWrite} latency_ms=${result.latencyMs}`,
		);
		if (result.outcome === "gave-up") {
			console.warn(`[strum-assistant] gave up after repair: ${result.repairErrors.join(" ")}`);
		}
		return json(result.reply, 200);
	} catch (error) {
		if (error instanceof Anthropic.RateLimitError) {
			return json({ error: "The assistant is busy. Try again in a moment." }, 429);
		}
		if (error instanceof Anthropic.AuthenticationError) {
			return json({ error: "The assistant is misconfigured on this deployment." }, 503);
		}
		console.error("[strum-assistant] model call failed:", error);
		return json({ error: "The assistant could not be reached." }, 502);
	}
}
