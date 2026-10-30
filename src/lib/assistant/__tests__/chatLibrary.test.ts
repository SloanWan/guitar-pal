import { describe, it, expect } from "vitest";
import { CHAT_TITLE_MAX, chatTitle, cleanTitle, hasModelReply, readChatSummaries, readSavedMessages } from "@/lib/assistant/chatLibrary";

const user = (text: string) => ({ id: text, role: "user" as const, text });
const reply = (text: string) => ({ id: `r ${text}`, role: "assistant" as const, text });

describe("chatTitle", () => {
	it("is the first question, on one line", () => {
		expect(chatTitle([reply("Hi"), user("  how do I\n get faster  from C to G? "), user("and then?")])).toBe(
			"how do I get faster from C to G?",
		);
	});

	it("cuts a long question at a word, within the table's limit", () => {
		const long = "why does my G chord buzz on the second string every time I change from C at a hundred and twenty beats a minute";
		const title = chatTitle([user(long)]);
		expect(title.endsWith("…")).toBe(true);
		expect(title.length).toBeLessThanOrEqual(81);
		expect(long.startsWith(title.slice(0, -1))).toBe(true);
		expect(title.slice(0, -1).endsWith(" ")).toBe(false);
	});

	it("is the question the model first answered, when the thread began elsewhere", () => {
		const thread = [user("C G Am F"), reply("Read straight from what you typed."), user("how do I get faster?"), { ...reply("Anchor"), model: "m" }];
		expect(chatTitle(thread)).toBe("how do I get faster?");
	});

	it("falls back to a plain name when nothing was asked", () => {
		expect(chatTitle([reply("Hello")])).toBe("Chat");
		expect(chatTitle([user("   ")])).toBe("Chat");
	});
});

describe("cleanTitle", () => {
	it("keeps a typed title on one line", () => {
		expect(cleanTitle("  C to G\n  practice ")).toBe("C to G practice");
	});

	it("is null when nothing is left, so the chat keeps its name", () => {
		expect(cleanTitle("   \n ")).toBeNull();
	});

	it("holds to the table's limit", () => {
		const title = cleanTitle("a ".repeat(200));
		expect(title?.length).toBeLessThanOrEqual(CHAT_TITLE_MAX);
		expect(title?.endsWith(" ")).toBe(false);
	});
});

describe("hasModelReply", () => {
	it("is true only once a model's answer has been typed out", () => {
		expect(hasModelReply([{}, { model: "", streamed: true }])).toBe(false);
		expect(hasModelReply([{}, { model: "deepseek-flash" }])).toBe(false);
		expect(hasModelReply([{}, { model: "deepseek-flash", streamed: true }])).toBe(true);
	});
});

describe("readSavedMessages", () => {
	it("keeps what reads as a message, marked typed out", () => {
		const saved = [user("q"), { ...reply("a"), model: "m", proposal: { name: "x" } }, { role: "assistant" }, "junk", null];
		expect(readSavedMessages(saved)).toEqual([
			{ ...user("q"), streamed: true },
			{ ...reply("a"), model: "m", proposal: { name: "x" }, streamed: true },
		]);
	});

	it("reads anything but an array as no messages", () => {
		expect(readSavedMessages({ messages: [] })).toEqual([]);
		expect(readSavedMessages(null)).toEqual([]);
	});
});

describe("readChatSummaries", () => {
	it("maps rows and drops the ones that are not chats", () => {
		expect(
			readChatSummaries([
				{ id: "a", title: "C to G", updated_at: "2026-10-30T10:00:00Z" },
				{ id: "b", title: 3, updated_at: "x" },
				null,
			]),
		).toEqual([{ id: "a", title: "C to G", updatedAt: "2026-10-30T10:00:00Z" }]);
		expect(readChatSummaries(null)).toEqual([]);
	});
});
