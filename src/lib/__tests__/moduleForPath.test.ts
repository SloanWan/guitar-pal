import { describe, expect, it } from "vitest";
import { moduleForHref, moduleForPath } from "../moduleForPath";

describe("moduleForPath", () => {
	it("maps each module route and its sub-routes", () => {
		expect(moduleForPath("/strum")).toBe("strum");
		expect(moduleForPath("/fingerpick")).toBe("tab");
		expect(moduleForPath("/fingerpick/edit/new")).toBe("tab");
		expect(moduleForPath("/chords")).toBe("chords");
		expect(moduleForPath("/chords/c/major")).toBe("chords");
		expect(moduleForPath("/fretboard")).toBe("fb");
		expect(moduleForPath("/books")).toBe("books");
		expect(moduleForPath("/books/42")).toBe("books");
	});

	it("treats module-less pages as home", () => {
		for (const path of ["/", "/home", "/settings", "/p/abc", "/docs/assistant-grammar"]) {
			expect(moduleForPath(path)).toBe("home");
		}
	});

	it("does not match a route that only shares a prefix", () => {
		expect(moduleForPath("/strumming")).toBe("home");
		expect(moduleForPath("/booksy")).toBe("home");
	});

	it("falls back to home without a pathname", () => {
		expect(moduleForPath(null)).toBe("home");
		expect(moduleForPath(undefined)).toBe("home");
		expect(moduleForPath("")).toBe("home");
	});
});

describe("moduleForHref", () => {
	it("reads the path past a query or hash", () => {
		expect(moduleForHref("/strum?pattern=abc", "/home")).toBe("strum");
		expect(moduleForHref("/fingerpick#top", "/home")).toBe("tab");
		expect(moduleForHref("/chords/create?frets=x32010", "/strum")).toBe("chords");
	});

	it("resolves a relative href against the page it is followed from", () => {
		expect(moduleForHref("?pattern=abc", "/strum")).toBe("strum");
		expect(moduleForHref("edit/new", "/fingerpick/")).toBe("tab");
	});

	it("is the page itself without an href", () => {
		expect(moduleForHref(null, "/books/42")).toBe("books");
		expect(moduleForHref("/", "/books/42")).toBe("home");
	});
});
