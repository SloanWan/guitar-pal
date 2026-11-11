import { describe, expect, it } from "vitest";
import { accountChanged, forgetKeptPages, serviceWorkerUrl } from "../offline";

describe("serviceWorkerUrl", () => {
	it("carries the build, so each build registers a new worker", () => {
		expect(serviceWorkerUrl("abc123")).toBe("/sw.js?v=abc123");
		expect(serviceWorkerUrl("a b")).toBe("/sw.js?v=a%20b");
	});
});

describe("accountChanged", () => {
	it("is false for the same account, signed in or out", () => {
		expect(accountChanged("u1", "u1")).toBe(false);
		expect(accountChanged("", null)).toBe(false);
	});

	it("is true on a sign-in, a sign-out, a switch, and when nothing was recorded", () => {
		expect(accountChanged("", "u1")).toBe(true);
		expect(accountChanged("u1", null)).toBe(true);
		expect(accountChanged("u1", "u2")).toBe(true);
		expect(accountChanged(null, null)).toBe(true);
		expect(accountChanged(null, "u1")).toBe(true);
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
