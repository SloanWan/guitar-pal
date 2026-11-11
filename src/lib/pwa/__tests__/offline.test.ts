import { describe, expect, it } from "vitest";
import { accountChanged, accountToRecord, forgetKeptPages, serviceWorkerUrl } from "../offline";

describe("serviceWorkerUrl", () => {
	it("carries the build, so each build registers a new worker", () => {
		expect(serviceWorkerUrl("abc123")).toBe("/sw.js?v=abc123");
		expect(serviceWorkerUrl("a b")).toBe("/sw.js?v=a%20b");
	});
});

describe("accountChanged", () => {
	it("is false for the same account seen again", () => {
		expect(accountChanged("u1", "INITIAL_SESSION", "u1")).toBe(false);
		expect(accountChanged("u1", "TOKEN_REFRESHED", "u1")).toBe(false);
	});

	it("is true on a sign-in, a switch, and the first account after a guest's pages", () => {
		expect(accountChanged("", "SIGNED_IN", "u1")).toBe(true);
		expect(accountChanged("u1", "SIGNED_IN", "u2")).toBe(true);
		expect(accountChanged(null, "INITIAL_SESSION", "u1")).toBe(true);
	});

	it("is true on a sign-out, unless already signed out", () => {
		expect(accountChanged("u1", "SIGNED_OUT", null)).toBe(true);
		expect(accountChanged(null, "SIGNED_OUT", null)).toBe(true);
		expect(accountChanged("", "SIGNED_OUT", null)).toBe(false);
	});

	it("never takes a missing session for a sign-out: offline with an expired token, Supabase reports none", () => {
		expect(accountChanged("u1", "INITIAL_SESSION", null)).toBe(false);
		expect(accountChanged("", "INITIAL_SESSION", null)).toBe(false);
	});
});

describe("accountToRecord", () => {
	it("records the account an event shows, and signed out on a sign-out", () => {
		expect(accountToRecord("", "SIGNED_IN", "u1")).toBe("u1");
		expect(accountToRecord("u1", "SIGNED_OUT", null)).toBe("");
	});

	it("keeps what was recorded when the event shows no session", () => {
		expect(accountToRecord("u1", "INITIAL_SESSION", null)).toBe("u1");
		expect(accountToRecord(null, "INITIAL_SESSION", null)).toBeNull();
	});
});

describe("forgetKeptPages", () => {
	it("deletes every build's kept pages and nothing else", async () => {
		const names = new Set(["gp-pages-old", "gp-pages-new", "gp-static-new", "gp-data-new", "someone-else"]);
		const storage = {
			keys: async () => [...names],
			delete: async (name: string) => names.delete(name),
		} as unknown as CacheStorage;
		await forgetKeptPages(storage);
		expect([...names].sort()).toEqual(["gp-data-new", "gp-static-new", "someone-else"]);
	});
});
