import { describe, expect, it } from "vitest";
import { modeModule, replyModule, statusLine, type StatusInput } from "@/lib/assistant/panelView";

describe("modeModule", () => {
	it("speaks in the domain's colour, General in ink and Book in books", () => {
		expect(modeModule("strum")).toBe("strum");
		expect(modeModule("tab")).toBe("tab");
		expect(modeModule("general")).toBe("home");
		expect(modeModule("book")).toBe("books");
	});
});

describe("replyModule", () => {
	it("takes the colour of the card a reply holds", () => {
		expect(replyModule({ proposal: {} })).toBe("strum");
		expect(replyModule({ edit: {} })).toBe("strum");
		expect(replyModule({ tabProposal: {} })).toBe("tab");
		expect(replyModule({ tabEdit: {} })).toBe("tab");
		expect(replyModule({ chords: [] })).toBe("chords");
	});

	it("tints a General reply by its card, not by the model that wrote it", () => {
		expect(replyModule({ model: "deepseek-flash", proposal: {} })).toBe("strum");
		expect(replyModule({ model: "deepseek-flash" })).toBe("home");
	});

	it("gives a rules reply without a card its domain's colour", () => {
		expect(replyModule({ domain: "tab" })).toBe("tab");
		expect(replyModule({})).toBe("strum");
	});

	it("marks a chapter answer as the book's and a failed turn as no one's", () => {
		expect(replyModule({ book: {}, model: "x" })).toBe("books");
		expect(replyModule({ failed: true, proposal: {} })).toBe("home");
	});
});

const BASE: StatusInput = {
	mode: "strum",
	signedIn: false,
	guestQuota: null,
	askedForGeneral: false,
	nudgeTo: null,
	bookContext: null,
};

describe("statusLine", () => {
	it("says the rules read offline when nothing else is pressing", () => {
		expect(statusLine(BASE)).toEqual({ kind: "offline" });
		expect(statusLine({ ...BASE, mode: "tab" })).toEqual({ kind: "offline" });
	});

	it("counts a guest's General turns as turns left", () => {
		expect(statusLine({ ...BASE, mode: "general", guestQuota: { used: 1, limit: 3 } })).toEqual({
			kind: "quota",
			left: 2,
			limit: 3,
		});
	});

	it("names the model for a signed-in player, or a guest the route has not counted yet", () => {
		expect(statusLine({ ...BASE, mode: "general", signedIn: true, guestQuota: { used: 5, limit: 3 } })).toEqual({ kind: "model" });
		expect(statusLine({ ...BASE, mode: "general" })).toEqual({ kind: "model" });
	});

	it("says why General is locked in General, or when the player reaches for it", () => {
		const usedUp = { used: 3, limit: 3 };
		expect(statusLine({ ...BASE, mode: "general", guestQuota: usedUp })).toEqual({ kind: "locked" });
		expect(statusLine({ ...BASE, guestQuota: usedUp })).toEqual({ kind: "offline" });
		expect(statusLine({ ...BASE, guestQuota: usedUp, askedForGeneral: true })).toEqual({ kind: "locked" });
	});

	it("puts the page's proposal ahead of the quota, which comes back once it is answered", () => {
		const input = { ...BASE, mode: "general" as const, guestQuota: { used: 0, limit: 3 }, nudgeTo: "book" as const };
		expect(statusLine(input)).toEqual({ kind: "nudge", to: "book" });
		expect(statusLine({ ...input, nudgeTo: null }).kind).toBe("quota");
	});

	it("names the open chapter in Book mode", () => {
		const bookContext = { bookTitle: "Three months", chapterTitle: "The right hand" };
		expect(statusLine({ ...BASE, mode: "book", bookContext })).toEqual({
			kind: "book",
			chapter: "The right hand",
			title: "Three months",
		});
		expect(statusLine({ ...BASE, mode: "book" })).toEqual({ kind: "offline" });
	});
});
