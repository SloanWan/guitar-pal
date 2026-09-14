import { describe, it, expect } from "vitest";
import { greeting, hint, playerName, INPUT_PROMPTS } from "@/lib/strumAssistant/greeting";

describe("playerName", () => {
	it("prefers a name the account carries", () => {
		expect(playerName({ full_name: "Sloan Wan" }, "nysuswan@gmail.com")).toBe("Sloan");
		expect(playerName({ name: "sloan" }, undefined)).toBe("Sloan");
	});

	it("falls back to the handle in an email", () => {
		expect(playerName({}, "nysuswan@gmail.com")).toBe("Nysuswan");
		expect(playerName(undefined, "first.last@example.com")).toBe("First");
	});

	it("leaves a name its owner capitalised alone", () => {
		expect(playerName({ full_name: "JSBach" }, undefined)).toBe("JSBach");
	});

	it("has no name rather than a bad one", () => {
		expect(playerName(undefined, undefined)).toBeNull();
		expect(playerName({}, "")).toBeNull();
		expect(playerName({ full_name: "x".repeat(40) }, undefined)).toBeNull();
	});
});

describe("greeting", () => {
	it("greets a guest without a gap where the name would be", () => {
		for (let i = 0; i < 20; i++) {
			const line = greeting(null, `session-${i}`);
			expect(line.trim()).not.toBe("");
			expect(line).not.toMatch(/null|undefined|\s,|,\s*[.?]/);
		}
	});

	it("uses the name when there is one", () => {
		const named = new Set(
			Array.from({ length: 20 }, (_, i) => greeting("Sloan", `session-${i}`)),
		);
		expect([...named].some((line) => line.includes("Sloan"))).toBe(true);
	});

	it("keeps one conversation on one greeting", () => {
		expect(greeting("Sloan", "abc")).toBe(greeting("Sloan", "abc"));
		// And a new conversation is free to differ.
		const lines = new Set(Array.from({ length: 30 }, (_, i) => greeting(null, `s${i}`)));
		expect(lines.size).toBeGreaterThan(1);
	});
});

describe("INPUT_PROMPTS", () => {
	it("offers something for every path, including one the model answers", () => {
		expect(INPUT_PROMPTS.length).toBeGreaterThanOrEqual(4);
		// Tab types these verbatim, so none of them may be a description of a
		// sentence rather than the sentence itself.
		for (const prompt of INPUT_PROMPTS) {
			expect(prompt.trim()).toBe(prompt);
			expect(prompt).not.toMatch(/^(e\.g\.|like|try)/i);
		}
	});
});

describe("the greeting in Chinese, and the aside for a guest", () => {
	it("greets in Chinese without a gap where a name would be", () => {
		for (let i = 0; i < 12; i++) {
			const line = greeting(null, `s${i}`, "zh");
			expect(line).toMatch(/[\u4e00-\u9fff]/);
			expect(line).not.toMatch(/，\s*[。？]|null/);
		}
		expect(greeting("Sloan", "abc", "zh")).toBe(greeting("Sloan", "abc", "zh"));
	});

	it("tells a guest where their work lives, and a member nothing of the sort", () => {
		expect(hint("en", false)).toMatch(/sign in/i);
		expect(hint("en", true)).not.toMatch(/sign in/i);
		expect(hint("zh", false)).toMatch(/登录/);
		expect(hint("zh", true)).not.toMatch(/登录/);
	});
});
