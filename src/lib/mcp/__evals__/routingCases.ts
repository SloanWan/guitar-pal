/**
 * The golden prompts for the MCP tools' metadata (#492): does a model reach
 * for Guitar Pal when it should, and leave it alone when it should not?
 *
 * - `direct` names Guitar Pal: a client that cannot route these is broken.
 * - `indirect` only describes the result the player wants (something to hear,
 *   play along to, bring a tab image to life). This is what a directory
 *   listing lives on: nobody types the connector's name.
 * - `negative` is guitar talk the tools add nothing to. Calling one there
 *   writes a public link nobody asked for.
 *
 * A case's `tool` is the one a right answer calls first; `null` means none.
 */

export type RoutingKind = "direct" | "indirect" | "negative";

export interface RoutingCase {
	id: string;
	kind: RoutingKind;
	prompt: string;
	tool: "propose_strum" | "propose_tab" | "import_tab" | "read_share" | null;
	/** A tab image sent with the prompt, from the gitignored tab gold; the case is skipped without it. */
	image?: string;
}

/** The reviewed crop the model eval scored readings against (E blues, hammers, slides, ties). */
export const TAB_IMAGE = "book-service/materials/tab-gold/books-batch1/crops/sample-text-tab-6p-p002-1.png";

export const ROUTING_CASES: readonly RoutingCase[] = [
	{ id: "direct-strum", kind: "direct", tool: "propose_strum", prompt: "Make me a Guitar Pal strumming pattern for C G Am F at 90 bpm." },
	{
		id: "direct-tab",
		kind: "direct",
		tool: "propose_tab",
		prompt: "Use Guitar Pal to write a slow 6/8 fingerpicking pattern over Am–F–C–G, thumb on the bass.",
	},
	{ id: "direct-image", kind: "direct", tool: "import_tab", prompt: "Bring this tab into Guitar Pal.", image: TAB_IMAGE },
	{
		id: "direct-read",
		kind: "direct",
		tool: "read_share",
		prompt: "What's in this Guitar Pal link? https://guitarpal.sloanwan.com/p/aB3xK9mQ2z",
	},
	{ id: "direct-zh", kind: "direct", tool: "propose_strum", prompt: "用 Guitar Pal 给我一个 C G Am F 的民谣扫弦，90 拍。" },

	{
		id: "indirect-strum",
		kind: "indirect",
		tool: "propose_strum",
		prompt: "I'm learning guitar. Give me a strumming pattern for a campfire song in G, C, D that I can actually hear and play along with.",
	},
	{
		id: "indirect-tab",
		kind: "indirect",
		tool: "propose_tab",
		prompt: "Write me an easy Travis-picking exercise in C and let me listen to how it should sound.",
	},
	{
		id: "indirect-image",
		kind: "indirect",
		tool: "import_tab",
		prompt: "Turn this picture into a guitar tab I can play back and loop.",
		image: TAB_IMAGE,
	},
	{
		id: "indirect-riff",
		kind: "indirect",
		tool: "propose_tab",
		prompt: "Compose a short blues lick in A with a couple of hammer-ons, something I can loop slowly while I practise.",
	},
	{ id: "indirect-zh", kind: "indirect", tool: "propose_tab", prompt: "帮我写一段 Am F C G 的指弹练习，我想听听它应该是什么样子。" },
	{
		id: "indirect-progression",
		kind: "indirect",
		tool: "propose_strum",
		prompt: "Can you set up a I–V–vi–IV progression in D with a pop strum so I can practise changing chords in time?",
	},

	{ id: "negative-theory", kind: "negative", tool: null, prompt: "Why does a capo change the key but not the chord shapes?" },
	{ id: "negative-gear", kind: "negative", tool: null, prompt: "What's a good acoustic guitar for a beginner under $300?" },
	{ id: "negative-fingering", kind: "negative", tool: null, prompt: "How do I stop my F barre chord from buzzing?" },
	{ id: "negative-lyrics", kind: "negative", tool: null, prompt: "Write the lyrics for a short song about a rainy Sunday." },
	{ id: "negative-history", kind: "negative", tool: null, prompt: "Who popularised Travis picking, and where does the name come from?" },
	{
		id: "negative-image-question",
		kind: "negative",
		tool: null,
		prompt: "What technique is the curved line between the 5 and the 7 in this tab? Just explain it.",
		image: TAB_IMAGE,
	},
];
