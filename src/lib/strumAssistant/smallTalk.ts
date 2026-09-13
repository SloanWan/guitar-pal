import { BLANK } from "@/lib/strumAssistant/suggest";

/**
 * The words people say to a chat box before they say anything to it.
 *
 * "hi", "thanks", "what can you do" are not requests, and reading them as
 * requests would turn every one into a miss with five sentences offered. They
 * get a line back — short, in this app's voice, on the subject of strumming —
 * and a nudge toward the sentences that actually do something. Matched as
 * whole messages only: "what chords go with C" is a question, not "what".
 */

export interface SmallTalk {
	text: string;
	/** Sentences to offer under it, when a nudge toward the syntax is due. */
	templates: string[];
}

/** What the assistant does, as sentences that do it. */
const STARTERS = [`C G Am F`, `D DU UD`, `add ${BLANK} to ${BLANK}`];

interface Topic {
	/** Whole-message matches, after lowercasing and stripping punctuation. */
	match: RegExp;
	replies: readonly string[];
	/** Whether to lay the starter sentences under the reply. */
	nudge: boolean;
}

const TOPICS: readonly Topic[] = [
	{
		match: /^(hi+|hey+|hello+|hiya|yo|sup|howdy|good (morning|afternoon|evening)|你好|您好|嗨|哈喽|哈罗|早|早上好|晚上好)( there| assistant| bot)?$/,
		replies: [
			"Hey. Pick's in hand — chords, a rhythm, or a change to a pattern you have?",
			"Hello! Strings are on. What are we playing?",
			"Hi there. Tuned up and counted in — say the word.",
		],
		nudge: true,
	},
	{
		match: /^(how are you|how are u|how r u|hru|hows it going|how is it going|whats up|wassup|how do you do|你好吗|最近怎么样|怎么样|在吗|在不在)( today)?$/,
		replies: [
			"In tune and in time — that's as good as it gets for me. You? Give me chords and let's find out.",
			"All six strings accounted for. Yours?",
			"Can't complain: nobody's played me out of tune yet. What are we working on?",
		],
		nudge: true,
	},
	{
		match: /^(thanks|thank you|thank u|thx|ty|cheers|nice|great|cool|perfect|awesome|谢谢|谢了|多谢|感谢|好的|不错|棒|赞)( a lot| so much| very much)?$/,
		replies: [
			"Anytime. Keep strumming.",
			"That's what I'm here for. Say the word when you want another.",
			"Good — now go play it a hundred times.",
		],
		nudge: false,
	},
	{
		match: /^(bye+|goodbye|see you|see ya|cya|later|good night|night|拜拜|再见|回见|晚安|走了)( now| then)?$/,
		replies: [
			"Later. Don't let the strings go dull.",
			"See you. Practice slow, play fast.",
			"Bye — the patterns will be here when you are.",
		],
		nudge: false,
	},
	{
		match: /^(help|\?+|what|what now|so|hm+|um+|huh|ok|okay|test|testing|你是谁|谁|帮助|帮帮我|怎么用|怎么玩|干嘛的|能干嘛|你能做什么|什么)$/,
		replies: [
			"I read three things: chords, a rhythm, or a change to one of your patterns — no guessing. One of these to start:",
			"Here's the whole trick: give me chords, or strokes, or tell me what to do with a pattern you've got. Like so:",
		],
		nudge: true,
	},
	{
		match: /^(who are you|what are you|what is this|what are u|what can you do|what do you do|what can u do|what should i (say|type|write)|how does this work|what do i do)\??$/,
		replies: [
			"A strumming assistant — I turn chords and strokes into patterns you can play, and edit the ones you have. Nothing gets saved without a yes from you. Try:",
			"The one who counts you in. Name some chords, write a rhythm, or tell me what to add to a pattern:",
		],
		nudge: true,
	},
];

/**
 * Lowercased and trimmed, with the punctuation people end a "hi" with taken
 * off and apostrophes dropped, so "How are you?" and "what's up" read as their
 * plain forms. A "?" alone is kept: on its own it is a question about the app.
 */
function normalize(input: string): string {
	const said = input.toLowerCase().replace(/['’]/g, "").trim();
	if (/^\?+$/.test(said)) return said;
	return said
		.replace(/[!！?？.。,，~～\s]+$/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** A stable pick per message text, so the same "hi" gets the same answer within a session. */
function pick<T>(items: readonly T[], key: string): T {
	let hash = 0;
	for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
	return items[hash % items.length];
}

export function smallTalk(input: string, seed = input): SmallTalk | null {
	const said = normalize(input);
	if (said === "") return null;
	const topic = TOPICS.find((t) => t.match.test(said));
	if (!topic) return null;
	return {
		text: pick(topic.replies, seed),
		templates: topic.nudge ? [...STARTERS] : [],
	};
}
