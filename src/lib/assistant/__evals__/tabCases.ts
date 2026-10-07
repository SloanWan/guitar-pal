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
		/**
		 * The card carries no validation warning. A pattern whose rhythm was
		 * guessed, or whose overrunning bar was trimmed, is not the pattern that
		 * was asked for — the bar count alone would let both through.
		 */
		noWarnings?: boolean;
		/**
		 * Every sounding fret lands in this inclusive range — the position the
		 * player asked for. Two frets that merged into one read far too high
		 * (and clamp to 24); a digit dropped reads far too low.
		 */
		frets?: [number, number];
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
		expect: { bars: [1, 4], noWarnings: true },
		why: "Described, not written: the reader if it can, else the model composes and the parser validates.",
	},
	{
		id: "tab-vague-meter",
		input: "something in 3/4 for fingerpicking, in G",
		tool: ["propose_tab", "read_tab"],
		expect: { bars: [1, 4], timeSignature: [3, 4], noWarnings: true },
		why: "The meter the player named must survive into the card.",
	},
	{
		id: "tab-vague-zh",
		input: "给我一个 Em 的分解和弦，慢一点，适合练习",
		tool: ["propose_tab", "read_tab"],
		expect: { bars: [1, 4], noWarnings: true },
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
	{
		id: "tab-order-meter",
		input: "Em: R 3 2 1 2 3 in 3/4",
		tool: "read_tab",
		expect: { bars: [1, 1], timeSignature: [3, 4] },
		why: "An order with a meter: the reader, and the meter must reach the card.",
	},
	{
		id: "tab-hold-order",
		input: "C G: R_32^132R_32^132",
		tool: "read_tab",
		expect: { bars: [2, 2] },
		why: "Holds in the order: sixteen cells are a bar of sixteenths, one per chord.",
	},
	{
		id: "tab-notes",
		input: "string:654321, fret:0-2-2-0-0-0",
		tool: "read_tab",
		expect: { bars: [1, 1] },
		why: "Notes written as string and fret lists: the reader, never a composed tab.",
	},
	{
		id: "tab-ascii-paste",
		input: [
			"e|-----0-----0-|",
			"B|---1-----1---|",
			"G|-0-----0-----|",
			"D|-------------|",
			"A|-------------|",
			"E|-0-----0-----|",
		].join("\n"),
		tool: "read_tab",
		expect: { bars: [1, 2] },
		why: "A pasted tab is read, not re-composed.",
	},
	{
		id: "tab-style-tempo-prose",
		input: "a travis-style pattern in D, faster than usual",
		tool: ["propose_tab", "read_tab"],
		expect: { bars: [1, 4], noWarnings: true },
		why: "A style word wrapped in prose the reader does not take: the model composes.",
	},
	{
		id: "tab-vague-compound",
		input: "fingerpicking for a sad song in Am, 6/8",
		tool: ["propose_tab", "read_tab"],
		expect: { bars: [1, 4], timeSignature: [6, 8], noWarnings: true },
		why: "A compound meter named in prose must survive into the card.",
	},
	{
		id: "tab-vague-zh-soft",
		input: "分解和弦 Am F，轻柔一点",
		tool: ["propose_tab", "read_tab"],
		expect: { bars: [1, 4], noWarnings: true },
		why: "Chords and a feel in Chinese, no order: the reader misses, so the model composes rather than asks.",
	},
	{
		id: "tab-bars-per-chord",
		input: "Am F C G 的指弹，每个和弦两小节",
		tool: ["propose_tab", "read_tab"],
		expect: { bars: [8, 8], noWarnings: true },
		why: "A bar count said in prose: four chords, two bars each, is eight bars.",
	},
	{
		id: "tab-edit-set-zh",
		input: "把 Travis Picking 设为 60 bpm",
		tool: "edit_tab",
		expect: {},
		why: "A tempo edit in Chinese naming a pattern the player has: the edit tool, and its card.",
	},
	{
		id: "tab-question-read",
		input: "how do I read tab?",
		tool: null,
		expect: { noCard: true },
		why: "A question about tab itself is answered, not made into one.",
	},
	{
		id: "tab-song-name-zh",
		input: "给我《晴天》的前奏指弹",
		tool: null,
		expect: { noCard: true },
		why: "A song by name in Chinese: declined, not invented.",
	},
	{
		id: "tab-scale-pentatonic-zh",
		input: "给我一个五声音阶的练习tab",
		tool: ["propose_tab", "read_tab"],
		expect: { bars: [2, 4], noWarnings: true },
		why: "An exercise is not a fingerpicking shape: a pentatonic box does not fit one bar, so it runs over as many as its notes need rather than being crammed into one and trimmed.",
	},
	{
		id: "tab-scale-up-down",
		input: "A minor pentatonic ascending and descending, eighth notes",
		tool: ["propose_tab", "read_tab"],
		expect: { bars: [2, 6], noWarnings: true },
		why: "Twelve notes up and twelve back is three bars of eighths — a bar count that has to be worked out, and a rhythm that must be written rather than guessed from spacing.",
	},
	{
		id: "tab-scale-high-position",
		input: "give me a scale exercise at the 12th fret in A minor",
		tool: ["propose_tab", "read_tab"],
		expect: { bars: [1, 6], noWarnings: true, frets: [9, 17] },
		why: "Two-digit frets: every note must land in the position asked for. Two that merge read as one impossible fret, and one that loses a digit reads near the nut.",
	},
	{
		id: "tab-sixteenths",
		input: "a sixteenth-note picking exercise in Am",
		tool: ["propose_tab", "read_tab"],
		expect: { bars: [1, 4], noWarnings: true },
		why: "Sixteenths are the resolution the grid has least room for — the one a bar is most likely to overrun.",
	},
];
