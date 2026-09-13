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
const GREETINGS: readonly ((name: string | null) => string)[] = [
	(name) => (name ? `Tuned up, ${name}. What are we playing?` : "Tuned up. What are we playing?"),
	(name) => (name ? `${name} — what are we working on?` : "What are we working on?"),
	() => "Strings on. What do you need?",
	(name) => (name ? `Hi ${name}. What's the idea?` : "What's the idea?"),
	() => "Ready when you are.",
	(name) => (name ? `Back at it, ${name}?` : "Back at it?"),
];

/**
 * A name to use, from whatever the account carries. Falls back to the part of
 * an email before the @, which is a handle more often than it is a mistake —
 * and to nothing at all, which every greeting here survives.
 */
export function playerName(metadata: Record<string, unknown> | undefined, email: string | undefined): string | null {
	const named = metadata?.full_name ?? metadata?.name ?? metadata?.user_name;
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

export function greeting(name: string | null, key?: string): string {
	const seed = key === undefined ? Math.random() : seedOf(key);
	const pick = GREETINGS[Math.floor(seed * GREETINGS.length) % GREETINGS.length];
	return pick(name);
}

/**
 * The example sentences the input field offers in turn.
 *
 * One per thing the assistant can do, in the order they cost: read, read, read,
 * and only then ask a model. Tab takes the one on screen, so each has to be a
 * sentence that works verbatim — nothing here is a description of a sentence.
 */
export const INPUT_PROMPTS: readonly string[] = [
	"C Am F G",
	"D DU UD",
	"C Am F G, DUDUDUDU",
	"a slow folk strum in C G Am F",
	"add C G Am F to old faithful",
	"给我一个 C-G-Am-F 的民谣扫弦，慢一点",
];
