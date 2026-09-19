import type Anthropic from "@anthropic-ai/sdk";
import { isToolName, type ProposeStrumInput, type ProposeTabInput, type ReadInput, type ToolName } from "@/lib/assistant/general/tools";
import { readInput, type ToolCard, type ToolExecution } from "@/lib/assistant/general/execute";
import type { GeneralContext } from "@/lib/assistant/general/request";
import { detectLang, pick, type Lang } from "@/lib/assistant/lang";
import type { AssistantTurn } from "@/lib/assistant/types";

/**
 * One General turn: the model, the tools it calls, and the loop between
 * them — driven from the client, where the readers live. The route is a
 * stateless proxy: each call sends the whole exchange so far and gets one
 * model step back; the tools run here, on the same code a rules turn uses,
 * and their results go back up with the next call.
 *
 * `call` and `execute` are injected so the loop is the same under the panel
 * (fetch to the route, readers in the browser) and under the eval runner
 * (the SDK directly, readers over fixtures).
 */

/** What one model call comes back as — the route's body, or the SDK's message. */
export interface ModelStep {
	content: Anthropic.ContentBlock[];
	stopReason: Anthropic.StopReason | null;
	/** The model that wrote this step, as the API names it — shown under the reply. */
	model?: string;
}

export type ToolInput = ReadInput | ProposeStrumInput | ProposeTabInput;

export interface GeneralTurnInput {
	text: string;
	/** Earlier turns of the thread, text only. */
	history: readonly AssistantTurn[];
	context: GeneralContext;
	call: (messages: readonly Anthropic.MessageParam[], context: GeneralContext) => Promise<ModelStep>;
	execute: (name: ToolName, input: ToolInput) => Promise<ToolExecution>;
	uiLang?: Lang;
	/** Model calls per turn — a read, a compose, one repair, the reply. Never a loop on the player's money. */
	maxCalls?: number;
}

export interface GeneralTurnOutcome {
	text: string;
	card?: ToolCard;
	lang: Lang;
	/** Round trips made; what the log line and the eval cost figure count. */
	calls: number;
	toolsUsed: ToolName[];
	/** Every tool the model tried failed — the eval counts it, the panel does not. */
	toolsFailed: boolean;
	/** Each tool call and what it came back with, for the eval log and the console. */
	trace: ToolTrace[];
	/** The model that answered, when a step said. */
	model?: string;
}

export interface ToolTrace {
	name: string;
	input: unknown;
	result: string;
	isError: boolean;
}

export const MAX_CALLS = 4;

/** A reply the model left blank — after a tool made something, or after it could not. */
function fallbackText(card: ToolCard | undefined, cardText: string | undefined, lang: Lang): string {
	if (cardText) return cardText;
	if (card) return pick(lang, "Here it is.", "做好了。");
	return pick(lang, "I couldn't make that. Try writing the chords or the rhythm out.", "这个我没做出来。试试把和弦或节奏直接写出来。");
}

export async function resolveGeneralTurn({
	text,
	history,
	context,
	call,
	execute,
	uiLang = "en",
	maxCalls = MAX_CALLS,
}: GeneralTurnInput): Promise<GeneralTurnOutcome> {
	const lang = detectLang(text, uiLang);
	const messages: Anthropic.MessageParam[] = [
		...history.map((t): Anthropic.MessageParam => ({ role: t.role, content: t.content })),
		{ role: "user", content: text },
	];
	let card: ToolCard | undefined;
	let cardText: string | undefined;
	const toolsUsed: ToolName[] = [];
	const trace: ToolTrace[] = [];
	let succeeded = 0;
	let calls = 0;
	let spoken = "";
	let model: string | undefined;

	while (calls < maxCalls) {
		const step = await call(messages, context);
		calls += 1;
		if (step.model) model = step.model;
		spoken = step.content
			.filter((b): b is Anthropic.TextBlock => b.type === "text")
			.map((b) => b.text.trim())
			.filter((t) => t !== "")
			.join("\n");
		const uses = step.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
		if (uses.length === 0 || step.stopReason !== "tool_use") break;

		messages.push({ role: "assistant", content: step.content });
		const results: Anthropic.ToolResultBlockParam[] = [];
		for (const use of uses) {
			const outcome = await run(use, execute);
			trace.push({ name: use.name, input: use.input, result: outcome.result, isError: outcome.isError });
			if (isToolName(use.name)) toolsUsed.push(use.name);
			if (!outcome.isError) {
				succeeded += 1;
				// The newest thing made is what the card shows; an earlier one in
				// the same turn was a step on the way.
				if (outcome.card) {
					card = outcome.card;
					cardText = outcome.text;
				}
			}
			results.push({ type: "tool_result", tool_use_id: use.id, content: outcome.result, is_error: outcome.isError });
		}
		messages.push({ role: "user", content: results });
	}

	return {
		text: spoken !== "" ? spoken : fallbackText(card, cardText, lang),
		...(card ? { card } : {}),
		lang,
		calls,
		toolsUsed,
		toolsFailed: toolsUsed.length > 0 && succeeded === 0,
		trace,
		...(model ? { model } : {}),
	};
}

async function run(use: Anthropic.ToolUseBlock, execute: GeneralTurnInput["execute"]): Promise<ToolExecution> {
	if (!isToolName(use.name)) return { result: `There is no tool called "${use.name}".`, isError: true };
	const input = readInput(use.name, use.input);
	if (!input.ok) return { result: `Bad input for ${use.name}: ${input.error}`, isError: true };
	try {
		return await execute(use.name, input.input);
	} catch (e) {
		console.error(`[assistant] tool ${use.name} threw:`, e);
		return { result: `${use.name} failed to run.`, isError: true };
	}
}
