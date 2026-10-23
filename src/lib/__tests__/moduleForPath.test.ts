import { describe, expect, it } from "vitest";
import { moduleForPath } from "../moduleForPath";

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
