import { describe, it, expect, beforeEach } from "vitest";
import {
	IDLE_MS,
	MAX_STORED_MESSAGES,
	STORAGE_KEY,
	storageKeyFor,
	isIdle,
	readConversation,
	writeConversation,
	type StoredMessage,
} from "../conversation";

const T0 = 1_700_000_000_000;

function msg(i: number): StoredMessage {
	return { id: `m${i}`, role: i % 2 ? "assistant" : "user", text: `message ${i}` };
}

describe("isIdle", () => {
	it("turns over exactly at the idle limit", () => {
		expect(isIdle(T0, T0 + IDLE_MS - 1)).toBe(false);
		expect(isIdle(T0, T0 + IDLE_MS)).toBe(true);
	});
});

describe("conversation storage", () => {
	beforeEach(() => sessionStorage.clear());

	it("round-trips a transcript within the idle window", () => {
		writeConversation([msg(0), msg(1)], T0);
		expect(readConversation(T0 + 5 * 60 * 1000)).toEqual([msg(0), msg(1)]);
	});

	it("is empty after ten minutes of silence", () => {
		writeConversation([msg(0), msg(1)], T0);
		expect(readConversation(T0 + IDLE_MS)).toEqual([]);
	});

	it("stamps the write time, so a later write extends the window", () => {
		writeConversation([msg(0)], T0);
		writeConversation([msg(0), msg(1)], T0 + 8 * 60 * 1000);
		expect(readConversation(T0 + 15 * 60 * 1000)).toEqual([msg(0), msg(1)]);
	});

	it("clears storage when the transcript is emptied", () => {
		writeConversation([msg(0)], T0);
		writeConversation([], T0);
		expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("keeps only the newest messages", () => {
		const many = Array.from({ length: MAX_STORED_MESSAGES + 5 }, (_, i) => msg(i));
		writeConversation(many, T0);
		const back = readConversation(T0);
		expect(back).toHaveLength(MAX_STORED_MESSAGES);
		expect(back[0]).toEqual(msg(5));
	});

	it("treats the old bare-array format as idle", () => {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify([msg(0)]));
		expect(readConversation(T0)).toEqual([]);
	});

	it("drops entries that do not read as messages and survives bad JSON", () => {
		sessionStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ messages: [msg(0), { id: 1 }, "x", null], touchedAt: T0 }),
		);
		expect(readConversation(T0)).toEqual([msg(0)]);
		sessionStorage.setItem(STORAGE_KEY, "{not json");
		expect(readConversation(T0)).toEqual([]);
	});

	it("keeps the strum and tab transcripts apart", () => {
		writeConversation([msg(0)], T0, "strum");
		writeConversation([msg(1), msg(2)], T0, "tab");
		expect(readConversation(T0, "strum")).toEqual([msg(0)]);
		expect(readConversation(T0, "tab")).toEqual([msg(1), msg(2)]);
		expect(storageKeyFor("strum")).toBe(STORAGE_KEY);
		expect(storageKeyFor("tab")).not.toBe(STORAGE_KEY);
		writeConversation([], T0, "tab");
		expect(readConversation(T0, "strum")).toEqual([msg(0)]);
	});
});
