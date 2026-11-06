import { describe, expect, it } from "vitest";
import { describeError, MAX_MESSAGE_CHARS, MAX_STACK_CHARS, routePattern, viewportClass } from "../events";

describe("routePattern", () => {
	it("names the dynamic segments", () => {
		expect(routePattern("/chords/c/major")).toBe("/chords/[rootSlug]/[suffixSlug]");
		expect(routePattern("/chords/a")).toBe("/chords/[rootSlug]");
		expect(routePattern("/books/7f3a")).toBe("/books/[id]");
		expect(routePattern("/p/AbC123")).toBe("/p/[id]");
		expect(routePattern("/tab/edit/new")).toBe("/tab/edit/[id]");
	});

	it("keeps the chords pages that are not a root", () => {
		for (const p of ["/chords/all", "/chords/grid", "/chords/my", "/chords/create"]) expect(routePattern(p)).toBe(p);
	});

	it("drops the query, the hash and a trailing slash", () => {
		expect(routePattern("/tab?pattern=abc#x")).toBe("/tab");
		expect(routePattern("/strum/")).toBe("/strum");
		expect(routePattern("/")).toBe("/");
		expect(routePattern("?x=1")).toBe("/");
	});

	it("bounds an unknown path", () => {
		expect(routePattern("/" + "a".repeat(500)).length).toBe(120);
	});
});

describe("viewportClass", () => {
	it("splits at the shell's 720px breakpoint", () => {
		expect(viewportClass(375)).toBe("phone");
		expect(viewportClass(719)).toBe("phone");
		expect(viewportClass(720)).toBe("desktop");
	});
});

describe("describeError", () => {
	it("reads an Error's name, message and stack", () => {
		const e = new TypeError("x is undefined");
		const d = describeError(e);
		expect(d.message).toBe("TypeError: x is undefined");
		expect(d.stack).toContain("x is undefined");
	});

	it("clips long messages and stacks", () => {
		const e = new Error("m".repeat(1000));
		e.stack = "s".repeat(5000);
		const d = describeError(e);
		expect(d.message.length).toBe(MAX_MESSAGE_CHARS);
		expect(d.stack?.length).toBe(MAX_STACK_CHARS);
	});

	it("takes whatever else was thrown as text", () => {
		expect(describeError("plain")).toEqual({ message: "plain" });
		expect(describeError({ code: 7 })).toEqual({ message: '{"code":7}' });
		expect(describeError(undefined)).toEqual({ message: "undefined" });
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		expect(describeError(cyclic)).toEqual({ message: "[object Object]" });
	});
});
