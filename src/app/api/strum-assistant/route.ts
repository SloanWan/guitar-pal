import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServer } from "@/lib/supabase-server";
import { parseRhythm } from "@/lib/strumAssistant/parseRhythm";
import { SlidingWindowLimiter } from "@/lib/strumAssistant/rateLimit";
import { ASSISTANT_OUTPUT_SCHEMA, ASSISTANT_SYSTEM_PROMPT } from "@/lib/strumAssistant/prompt";
import type { AssistantDraft, AssistantReply, AssistantTurn } from "@/lib/strumAssistant/types";

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

const MODEL = "claude-opus-5";
/** The output is a short JSON object; a large cap would only widen the blast radius. */
const MAX_OUTPUT_TOKENS = 1024;
const MAX_TURNS = 12;
const MAX_CHARS_PER_TURN = 600;
const MAX_REPAIR_ATTEMPTS = 1;

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

interface ModelOutput {
	action: "propose" | "ask" | "decline";
	message: string;
	draft: AssistantDraft & { bpm: number };
}

/** Shape check only — the semantic checks that drive the repair loop follow. */
function isModelOutput(value: unknown): value is ModelOutput {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	if (v.action !== "propose" && v.action !== "ask" && v.action !== "decline") return false;
	if (typeof v.message !== "string") return false;
	if (typeof v.draft !== "object" || v.draft === null) return false;
	const d = v.draft as Record<string, unknown>;
	return (
		(d.kind === "pattern" || d.kind === "progression") &&
		typeof d.name === "string" &&
		typeof d.rhythm === "string" &&
		Array.isArray(d.chords) &&
		d.chords.every((c) => typeof c === "string") &&
		typeof d.bpm === "number" &&
		typeof d.rhythmGuessed === "boolean"
	);
}

/**
 * What the schema cannot express. A structured output is already guaranteed to
 * fit the shape, so this only checks meaning: that a proposed rhythm is really
 * playable notation, and that a proposal offers something at all.
 */
function semanticErrors(output: ModelOutput): string[] {
	const errors: string[] = [];
	if (output.message.trim() === "") errors.push("message was empty.");
	if (output.action !== "propose") return errors;

	const hasChords = output.draft.chords.length > 0;
	const rhythm = output.draft.rhythm.trim();
	if (rhythm === "" && !hasChords) {
		errors.push("action was propose but the draft has neither a rhythm nor chords.");
	}
	if (rhythm !== "") {
		const parsed = parseRhythm(output.draft.rhythm);
		if (!parsed.ok) {
			errors.push(
				`rhythm "${output.draft.rhythm}" is not valid notation: ${parsed.errors
					.map((e) => e.message)
					.join(" ")}`,
			);
		}
	}
	return errors;
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
	const messages: Anthropic.MessageParam[] = turns.map((t) => ({
		role: t.role,
		content: t.content,
	}));

	let attempt = 0;
	let lastErrors: string[] = [];

	while (attempt <= MAX_REPAIR_ATTEMPTS) {
		let response: Anthropic.Message;
		try {
			response = await client.messages.create({
				model: MODEL,
				max_tokens: MAX_OUTPUT_TOKENS,
				system: [
					{
						type: "text",
						text: ASSISTANT_SYSTEM_PROMPT,
						cache_control: { type: "ephemeral" },
					},
				],
				// Short extraction-and-classification work: low effort is the right
				// setting and keeps the per-request cost down.
				output_config: {
					effort: "low",
					format: { type: "json_schema", schema: ASSISTANT_OUTPUT_SCHEMA },
				},
				messages,
			});
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

		console.info(
			`[strum-assistant] user=${user.id} attempt=${attempt} in=${response.usage.input_tokens} out=${response.usage.output_tokens} cache_read=${response.usage.cache_read_input_tokens ?? 0} stop=${response.stop_reason}`,
		);

		if (response.stop_reason === "refusal") {
			return json({ message: "I can't help with that one. Ask me about strumming patterns or chord progressions." } satisfies AssistantReply, 200);
		}

		const text = response.content.find((b) => b.type === "text");
		let parsed: unknown = null;
		if (text) {
			try {
				parsed = JSON.parse(text.text);
			} catch {
				parsed = null;
			}
		}

		if (isModelOutput(parsed)) {
			const errors = semanticErrors(parsed);
			if (errors.length === 0) {
				const reply: AssistantReply = { message: parsed.message };
				if (parsed.action === "propose") {
					reply.draft = {
						kind: parsed.draft.kind,
						name: parsed.draft.name,
						rhythm: parsed.draft.rhythm,
						chords: parsed.draft.chords,
						bpm: parsed.draft.bpm > 0 ? parsed.draft.bpm : null,
						rhythmGuessed: parsed.draft.rhythmGuessed,
					};
				}
				return json(reply, 200);
			}
			lastErrors = errors;
		} else {
			lastErrors = ["the reply did not match the required shape."];
		}

		// Bounded repair: quote the concrete failures back once, then give up
		// rather than looping on the user's money.
		attempt += 1;
		if (attempt > MAX_REPAIR_ATTEMPTS) break;
		messages.push(
			{ role: "assistant", content: text?.text ?? "" },
			{
				role: "user",
				content: `That reply could not be used: ${lastErrors.join(" ")} Answer again, correcting only those points.`,
			},
		);
	}

	console.warn(`[strum-assistant] gave up after repair: ${lastErrors.join(" ")}`);
	return json(
		{
			message:
				"I couldn't put that into a pattern I trust. Try naming the chords, or type a rhythm like \"D DU UD\".",
		} satisfies AssistantReply,
		200,
	);
}
