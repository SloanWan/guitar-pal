import type { AssistantDomain, AssistantMode } from "./types";

/**
 * What the panel shows, decided from the conversation's state: which module a
 * reply wears and what the one status line under the mode chip says. Pure, so
 * the choices are tested apart from the panel that draws them.
 */

/** A `data-m` module: the Candy alias a bubble or a card is painted through. */
export type PanelModule = "strum" | "tab" | "chords" | "books" | "home";

/** The module a mode speaks in. General has none of its own and speaks in ink. */
export function modeModule(mode: AssistantMode): PanelModule {
	if (mode === "general") return "home";
	if (mode === "book") return "books";
	return mode;
}

/** The parts of a reply that decide its colour; presence is all that is read. */
export interface ReplyShape {
	domain?: AssistantDomain;
	book?: unknown;
	proposal?: unknown;
	edit?: unknown;
	tabProposal?: unknown;
	tabEdit?: unknown;
	chords?: unknown;
	model?: string;
	failed?: boolean;
}

/**
 * The module a reply's bubble is tinted with: what the reply holds, not the page
 * it is read on and not the mode that asked. A card names its module; a reply
 * without one is the reader's that wrote it — General's words are ink, a rules
 * reply its domain's. A failed turn is an aside and wears no colour.
 */
export function replyModule(reply: ReplyShape): PanelModule {
	if (reply.failed) return "home";
	if (reply.book) return "books";
	if (reply.proposal || reply.edit) return "strum";
	if (reply.tabProposal || reply.tabEdit) return "tab";
	if (reply.chords) return "chords";
	if (reply.model) return "home";
	return reply.domain ?? "strum";
}

/** The one status line: always there, one row high, saying the most pressing thing. */
export type StatusLine =
	| { kind: "locked" }
	| { kind: "quota"; left: number; limit: number }
	| { kind: "nudge"; to: AssistantMode }
	| { kind: "book"; chapter: string; title: string }
	| { kind: "model" }
	| { kind: "offline" };

export interface StatusInput {
	mode: AssistantMode;
	signedIn: boolean;
	/** A guest's General turns as the route last reported them; null until it has. */
	guestQuota: { used: number; limit: number } | null;
	/** The player pressed or pointed at General after its free turns ran out. */
	askedForGeneral: boolean;
	/** The page's proposal to switch, while it stands. */
	nudgeTo: AssistantMode | null;
	bookContext: { bookTitle: string; chapterTitle: string } | null;
}

/**
 * Which line shows, most pressing first: why General is locked, when the player
 * reached for it; the page's one-time proposal to switch; a guest's General
 * turns; the open chapter; and otherwise what the chosen assistant is.
 */
export function statusLine(input: StatusInput): StatusLine {
	const { mode, signedIn, guestQuota, askedForGeneral, nudgeTo, bookContext } = input;
	const usedUp = !signedIn && guestQuota !== null && guestQuota.used >= guestQuota.limit;
	if (usedUp && (askedForGeneral || mode === "general")) return { kind: "locked" };
	if (nudgeTo !== null) return { kind: "nudge", to: nudgeTo };
	if (mode === "general") {
		return !signedIn && guestQuota !== null
			? { kind: "quota", left: guestQuota.limit - guestQuota.used, limit: guestQuota.limit }
			: { kind: "model" };
	}
	if (mode === "book" && bookContext !== null) {
		return { kind: "book", chapter: bookContext.chapterTitle, title: bookContext.bookTitle };
	}
	return { kind: "offline" };
}
