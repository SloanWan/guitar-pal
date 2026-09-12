import Anthropic from "@anthropic-ai/sdk";
import { parseRhythm } from "@/lib/strumAssistant/parseRhythm";
import { ASSISTANT_OUTPUT_SCHEMA, ASSISTANT_SYSTEM_PROMPT } from "@/lib/strumAssistant/prompt";
import type { AssistantDraft, AssistantReply, AssistantTurn } from "@/lib/strumAssistant/types";

/**
 * The model call, with its repair loop, as one function.
 *
 * Server-only — it holds an SDK client. Lifted out of the route so the eval
 * runner (#137) can drive exactly the code the route runs, and so the route's
 * log line and the runner's cost figure are read off the same numbers instead
 * of two accountings that drift.
 *
 * SDK errors are not caught here: the route maps them to statuses, the runner
 * counts them, and neither wants the other's policy.
 */

export const MODEL = "claude-opus-5";
/** The output is a short JSON object; a large cap would only widen the blast radius. */
const MAX_OUTPUT_TOKENS = 1024;
const MAX_REPAIR_ATTEMPTS = 1;

/** What one round trip cost, in the units the bill is written in. */
export interface ModelAttempt {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	stopReason: string | null;
}

export type ModelOutcome =
	/** A draft the client can preview. */
	| "proposed"
	/** A question or a decline — speech, no draft. */
	| "spoke"
	/** The model's own safety refusal. */
	| "refused"
	/** Nothing usable after the repair; the apology reply. */
	| "gave-up";

export interface AskModelResult {
	reply: AssistantReply;
	outcome: ModelOutcome;
	/** One entry per round trip, so a repaired answer shows as two. */
	attempts: ModelAttempt[];
	latencyMs: number;
	/** The failures quoted back to the model, when there were any. */
	repairErrors: string[];
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

export const REFUSAL_REPLY = "I can't help with that one. Ask me about strumming patterns or chord progressions.";
export const GAVE_UP_REPLY =
	"I couldn't put that into a pattern I trust. Try naming the chords, or type a rhythm like \"D DU UD\".";

function attemptOf(response: Anthropic.Message): ModelAttempt {
	return {
		inputTokens: response.usage.input_tokens,
		outputTokens: response.usage.output_tokens,
		cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
		cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
		stopReason: response.stop_reason,
	};
}

export async function askModel(client: Anthropic, turns: AssistantTurn[]): Promise<AskModelResult> {
	const started = Date.now();
	const messages: Anthropic.MessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
	const attempts: ModelAttempt[] = [];
	const finish = (reply: AssistantReply, outcome: ModelOutcome, repairErrors: string[]): AskModelResult => ({
		reply,
		outcome,
		attempts,
		latencyMs: Date.now() - started,
		repairErrors,
	});

	let attempt = 0;
	let lastErrors: string[] = [];

	while (attempt <= MAX_REPAIR_ATTEMPTS) {
		const response = await client.messages.create({
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
		attempts.push(attemptOf(response));

		if (response.stop_reason === "refusal") {
			return finish({ message: REFUSAL_REPLY }, "refused", lastErrors);
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
				return finish(reply, reply.draft ? "proposed" : "spoke", lastErrors);
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

	return finish({ message: GAVE_UP_REPLY }, "gave-up", lastErrors);
}
