import { pick, type Lang } from "@/lib/strumAssistant/lang";
import type { AssistantDomain } from "@/lib/strumAssistant/types";
import { NICKNAME_KEY } from "@/lib/profile";

/**
 * What the panel says before anyone has said anything.
 *
 * A greeting is the one line in here nobody asked for, so it earns its place by
 * being short and by sounding like this app rather than like a support desk —
 * no "how may I assist you today". Half of them name the player when the app
 * knows what to call them; the other half never do, so a guest's panel does not
 * read as a worse version of someone else's.
 */

/** Written as functions of the name so the same line works with and without one. */
const GREETINGS: Record<Lang, readonly ((name: string | null) => string)[]> = {
	en: [
		(name) => (name ? `Tuned up, ${name}. What are we playing?` : "Tuned up. What are we playing?"),
		(name) => (name ? `${name} — what are we working on?` : "What are we working on?"),
		() => "Strings on. What do you need?",
		(name) => (name ? `Hi ${name}. What's the idea?` : "What's the idea?"),
		() => "Ready when you are.",
		(name) => (name ? `Back at it, ${name}?` : "Back at it?"),
	],
	zh: [
		(name) => (name ? `调好音了，${name}。弹什么？` : "调好音了。弹什么？"),
		(name) => (name ? `${name}——今天练什么？` : "今天练什么？"),
		() => "弦上好了。要什么？",
		(name) => (name ? `嗨，${name}。有什么想法？` : "有什么想法？"),
		() => "准备好了，你说开始。",
		(name) => (name ? `又来了，${name}？` : "又来了？"),
	],
};

/**
 * The line under the greeting: what this thing does. A guest also hears that
 * their patterns stay on this device until they sign in — said once, here,
 * rather than at the moment they try to save.
 */
export function hint(lang: Lang, signedIn: boolean, domain: AssistantDomain = "strum"): string {
	const what =
		domain === "tab"
			? pick(
					lang,
					"Chords with the strings to pick, strings and frets written out, a style word over a chord, or six lines of tab pasted in — all read instantly, offline. If a sentence doesn't land, I'll show you ones that would.",
					"和弦加要弹的弦号、直接写弦号和品格、风格词加和弦，或者直接贴六行 tab——都能直接读，不联网。哪句没读懂，我会给你能读懂的写法。",
				)
			: pick(
					lang,
					"Chords, a rhythm, or a change to one of your patterns — all read instantly, offline. If a sentence doesn't land, I'll show you ones that would.",
					"和弦、节奏，或者改一个你已有的 pattern——都能直接读，不联网。哪句没读懂，我会给你能读懂的写法。",
				);
	if (signedIn) return what;
	return `${what} ${pick(
		lang,
		"You're not signed in, so anything you make stays on this device — sign in to keep it across devices.",
		"你还没登录，做出来的东西只留在这台设备上——登录后才能跨设备保存。",
	)}`;
}

/**
 * A name to use, from whatever the account carries. Falls back to the part of
 * an email before the @, which is a handle more often than it is a mistake —
 * and to nothing at all, which every greeting here survives.
 */
export function playerName(metadata: Record<string, unknown> | undefined, email: string | undefined): string | null {
	// A nickname the player set themselves outranks whatever the provider wrote
	// — the same order the topbar avatar uses (profile.ts).
	const named =
		metadata?.[NICKNAME_KEY] ?? metadata?.full_name ?? metadata?.name ?? metadata?.user_name;
	const raw = typeof named === "string" && named.trim() !== "" ? named : (email?.split("@")[0] ?? "");
	const first = raw.trim().split(/[\s._-]+/)[0];
	if (first === "" || first.length > 24) return null;
	// Only a handle that is plainly lowercase is capitalised: "sloan" becomes
	// "Sloan", while "JSBach" and "x_ae" are left as their owner wrote them.
	return first === first.toLowerCase() ? first[0].toUpperCase() + first.slice(1) : first;
}

/**
 * A stable number in 0–1 for any string, so one conversation keeps one
 * greeting: the panel unmounts every time the popover closes, and a line that
 * changed each time it was reopened would read as a different assistant.
 */
function seedOf(key: string): number {
	let hash = 0;
	for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
	return (hash % 1000) / 1000;
}

export function greeting(name: string | null, key?: string, lang: Lang = "en"): string {
	const seed = key === undefined ? Math.random() : seedOf(key);
	const lines = GREETINGS[lang];
	return lines[Math.floor(seed * lines.length) % lines.length](name);
}

/**
 * The example sentences the input field offers in turn.
 *
 * One per thing the assistant can do, in the order they cost: read, read, read,
 * and only then ask a model. Tab takes the one on screen, so each has to be a
 * sentence that works verbatim — nothing here is a description of a sentence.
 */
const INPUT_PROMPTS: Record<AssistantDomain, readonly string[]> = {
	strum: [
		"C Am F G",
		"D DU UD",
		"C Am F G, DUDUDUDU",
		"a slow folk strum in C G Am F",
		"add C G Am F to old faithful",
		"给我一个 C-G-Am-F 的民谣扫弦，慢一点",
	],
	tab: [
		"C G Am F: 根3231323",
		"Am: 5 3 2 1 3 2 1 3",
		"travis picking in C",
		"G D Em C: 根3(12)3",
		"string:66544322, fret:8(11)(10)8(10)88(11)",
		"C G Am F: 5/4 2 1 3",
		"Em 三指法",
		"waltz in G, 100 bpm",
	],
};

export function inputPrompts(domain: AssistantDomain): readonly string[] {
	return INPUT_PROMPTS[domain];
}

/**
 * Shown on an empty panel: each one read by the app, so every click lands.
 * On strum a lone "C" would not — one chord is a key, not a progression — so
 * the strum examples start at two chords.
 */
const EXAMPLES: Record<AssistantDomain, readonly string[]> = {
	strum: ["C Am F G", "D DU UD", "a slow folk strum in C G Am F"],
	tab: ["C G Am F: R3231323", "Am: 53231323", "travis picking in C"],
};

export function examples(domain: AssistantDomain): readonly string[] {
	return EXAMPLES[domain];
}
