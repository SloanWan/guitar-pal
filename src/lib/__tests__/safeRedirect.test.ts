import { describe, it, expect } from "vitest";
import { safeRedirectPath, signInHref, DEFAULT_REDIRECT } from "../safeRedirect";

describe("safeRedirectPath", () => {
	it("keeps a same-origin path, including query and hash", () => {
		expect(safeRedirectPath("/settings")).toBe("/settings");
		expect(safeRedirectPath("/")).toBe("/");
		expect(safeRedirectPath("/dev/session/abc?x=1#top")).toBe("/dev/session/abc?x=1#top");
	});

	it("falls back when the param is missing or empty", () => {
		expect(safeRedirectPath(null)).toBe(DEFAULT_REDIRECT);
		expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT);
		expect(safeRedirectPath("")).toBe(DEFAULT_REDIRECT);
	});

	it("rejects absolute URLs", () => {
		expect(safeRedirectPath("https://evil.com")).toBe(DEFAULT_REDIRECT);
		expect(safeRedirectPath("javascript:alert(1)")).toBe(DEFAULT_REDIRECT);
		expect(safeRedirectPath("evil.com/home")).toBe(DEFAULT_REDIRECT);
	});

	it("rejects protocol-relative URLs, including the backslash spelling", () => {
		expect(safeRedirectPath("//evil.com")).toBe(DEFAULT_REDIRECT);
		expect(safeRedirectPath("/\\evil.com")).toBe(DEFAULT_REDIRECT);
		expect(safeRedirectPath("//")).toBe(DEFAULT_REDIRECT);
	});

	it("honours a custom fallback", () => {
		expect(safeRedirectPath("//evil.com", "/")).toBe("/");
	});
});

describe("signInHref", () => {
	it("carries the current path as the redirect target", () => {
		expect(signInHref("/strum")).toBe("/auth?redirect=%2Fstrum");
	});

	it("keeps the query string", () => {
		expect(signInHref("/chords/all", "?q=am7")).toBe("/auth?redirect=%2Fchords%2Fall%3Fq%3Dam7");
	});

	it("round-trips through safeRedirectPath", () => {
		const href = signInHref("/chords/c/major", "?voicing=2");
		const param = new URL(href, "http://x").searchParams.get("redirect");
		expect(safeRedirectPath(param)).toBe("/chords/c/major?voicing=2");
	});
});
