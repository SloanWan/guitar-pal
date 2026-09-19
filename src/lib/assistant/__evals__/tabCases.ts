import type { ToolName } from "@/lib/assistant/general/tools";

/**
 * The General assistant over fingerpicking. The strum cases in `cases.ts`
 * grade the proposal; these grade the choice of tool and the card that came
 * of it — the tab readers have their own unit tests for what is in the card.
 */
export interface TabEvalCase {
	id: string;
	input: string;
	/** The tool the model must reach for — any of a list; null when it must answer with none. */
	tool: ToolName | readonly ToolName[] | null;
	expect: {
		/** A card must be shown, with this many bars (inclusive range). */
		bars?: [number, number];
		timeSignature?: [number, number];
		/** No card: a question, an answer, or a decline. */
		noCard?: boolean;
	};
	why: string;
}

export const TAB_EVAL_CASES: readonly TabEvalCase[] = [
	{
		id: "tab-pick-order",
		input: "Am: 5 3 2 1 3 2 1 3",
		tool: "read_tab",
		expect: { bars: [1, 1] },
		why: "Written out: the reader, never the model.",
	},
	{
		id: "tab-style-word",
		input: "travis picking in C",
		tool: "read_tab",
		expect: { bars: [1, 4] },
		why: "A style word over a chord is a sentence the reader knows.",
	},
	{
		id: "tab-vague-style",
		input: "a gentle fingerpicking pattern for Am and F, something like a lullaby",
		tool: ["propose_tab", "read_tab"],
		expect: { bars: [1, 4] },
		why: "Described, not written: the reader if it can, else the model composes and the parser validates.",
	},
	{
		id: "tab-vague-meter",
		input: "something in 3/4 for fingerpicking, in G",
		tool: ["propose_tab", "read_tab"],
		expect: { bars: [1, 4], timeSignature: [3, 4] },
		why: "The meter the player named must survive into the card.",
	},
	{
		id: "tab-vague-zh",
		input: "给我一个 Em 的分解和弦，慢一点，适合练习",
		tool: ["propose_tab", "read_tab"],
		expect: { bars: [1, 4] },
		why: "The same in Chinese.",
	},
	{
		id: "tab-song-name",
		input: "give me the fingerpicking intro to Blackbird",
		tool: null,
		expect: { noCard: true },
		why: "A song by name must be declined, not invented.",
	},
	{
		id: "tab-question",
		input: "which fingers should play which strings in Travis picking?",
		tool: null,
		expect: { noCard: true },
		why: "A question is answered, not made into a pattern.",
	},
	{
		id: "tab-edit-named",
		input: "add to Travis Picking: Am: 5 3 2 1",
		tool: "edit_tab",
		expect: { bars: [1, 1] },
		why: "An edit names its target; the edit reader takes the sentence whole.",
	},
];
