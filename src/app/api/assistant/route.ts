import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { createSupabaseServer } from "@/lib/supabase-server";
import {
	admitGuestTurn,
	decodeGuest,
	encodeGuest,
	GUEST_COOKIE,
	GUEST_TURN_LIMIT,
	GUEST_WINDOW_MS,
	newGuest,
	type GuestQuota,
} from "@/lib/assistant/general/guest";
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
 *  1. A signed-in user gets a per-user rate limit, per model call (see
 *     rateLimit.ts for its in-process caveat). A turn is at most a few
 *     calls, so this is a dozen turns an hour.
 *  2. A guest gets three turns a day, counted in a signed cookie (guest.ts),
 *     under an hourly cap per IP and a daily budget for all guests together —
 *     the two that bound a visitor who clears the cookie. An open LLM
 *     endpoint is otherwise a free proxy for anyone who finds it, and that
 *     is how a side project gets a large bill; the budget is what keeps the
 *     worst case a known number.
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

const HOUR_MS = 60 * 60 * 1000;
const limiter = new SlidingWindowLimiter({ limit: 40, windowMs: HOUR_MS });
/** Guests, per IP: enough for a few turns' worth of loops, not for a script. */
const guestIpLimiter = new SlidingWindowLimiter({ limit: 20, windowMs: HOUR_MS });
/** Guests, all together, per day — the number the worst case on one instance cannot exceed. */
const GUEST_DAILY_CALLS = Number(process.env.ASSISTANT_GUEST_DAILY_CALLS) || 300;
const guestBudget = new SlidingWindowLimiter({ limit: GUEST_DAILY_CALLS, windowMs: GUEST_WINDOW_MS });

/**
 * The cookie's signing key, derived from the one secret this route already
 * needs. A signature never reveals the key, and a leaked cookie is worth
 * three turns.
 */
function guestKey(): string {
	return createHash("sha256").update(`assistant-guest:${process.env.ANTHROPIC_API_KEY ?? ""}`).digest("hex");
}

/**
 * The first hop of `x-forwarded-for`, which the platform in front of this
 * sets. With no proxy every guest shares the one bucket, which errs safe.
 */
function clientIp(request: Request): string {
	const forwarded = request.headers.get("x-forwarded-for");
	const first = forwarded?.split(",")[0]?.trim();
	return first || request.headers.get("x-real-ip") || "unknown";
}

function readCookie(request: Request, name: string): string | undefined {
	const header = request.headers.get("cookie");
	if (!header) return undefined;
	for (const part of header.split(";")) {
		const [k, ...rest] = part.trim().split("=");
		if (k === name) return rest.join("=");
	}
	return undefined;
}

function guestCookieHeader(value: string): string {
	const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
	return `${GUEST_COOKIE}=${value}; Path=/api/assistant; Max-Age=${Math.floor(GUEST_WINDOW_MS / 1000)}; HttpOnly; SameSite=Lax${secure}`;
}

function json(body: unknown, status: number, headers?: HeadersInit): Response {
	return Response.json(body, { status, headers });
}

function error(message: string, status: number, retryAfterSeconds?: number, guest?: GuestQuota): Response {
	const body: AssistantErrorBody = {
		error: message,
		...(retryAfterSeconds ? { retryAfterSeconds } : {}),
		...(guest ? { guest } : {}),
	};
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

	/** Who this call is logged as, and — for a guest — the cookie and quota to send back. */
	let who: string;
	let guest: { cookie: string; quota: GuestQuota } | null = null;
	if (user) {
		who = `user=${user.id}`;
		const verdict = limiter.check(user.id);
		if (!verdict.allowed) {
			return error("You have used the assistant a lot in the last hour. Try again shortly.", 429, verdict.retryAfterSeconds);
		}
	} else {
		const turnId = body.turnId;
		if (typeof turnId !== "string" || turnId === "" || turnId.length > 64) return error("A guest turn needs a turnId.", 400);
		const key = guestKey();
		const record = decodeGuest(readCookie(request, GUEST_COOKIE), key) ?? newGuest();
		const admitted = admitGuestTurn(record, turnId, Date.now());
		if (!admitted.allowed) {
			return error(
				`Your ${GUEST_TURN_LIMIT} free turns for today are used up. Sign in to keep going.`,
				429,
				admitted.retryAfterSeconds,
				admitted.quota,
			);
		}
		const ip = guestIpLimiter.check(clientIp(request));
		if (!ip.allowed) return error("Too many free turns from this connection. Sign in, or try again later.", 429, ip.retryAfterSeconds, admitted.quota);
		const budget = guestBudget.check("all");
		if (!budget.allowed) return error("Today's free turns are all used up. Sign in to continue.", 429, budget.retryAfterSeconds, admitted.quota);
		who = `guest=${record.id}`;
		guest = { cookie: encodeGuest(admitted.record, key), quota: admitted.quota };
	}

	const client = new Anthropic();
	try {
		const { step, attempt, latencyMs } = await callGeneral(client, MODEL, messages, context);
		const tools = step.content.filter((b) => b.type === "tool_use").map((b) => (b.type === "tool_use" ? b.name : "")).join(",");
		// One line per model call, with everything a cost-per-call figure needs.
		console.info(
			`[assistant] ${who} model=${MODEL} stop=${attempt.stopReason} tools=${tools || "-"} in=${attempt.inputTokens} out=${attempt.outputTokens} cache_read=${attempt.cacheReadTokens} cache_write=${attempt.cacheWriteTokens} latency_ms=${latencyMs}`,
		);
		if (!guest) return json(step, 200);
		return json({ ...step, guest: guest.quota }, 200, { "Set-Cookie": guestCookieHeader(guest.cookie) });
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
