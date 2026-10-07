// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { createAssistantClient, vendorApiKey, vendorFor } from "@/lib/assistant/general/vendor";

const saved = { anthropic: process.env.ANTHROPIC_API_KEY, deepseek: process.env.DEEPSEEK_API_KEY };
afterEach(() => {
	process.env.ANTHROPIC_API_KEY = saved.anthropic;
	process.env.DEEPSEEK_API_KEY = saved.deepseek;
});

describe("vendorFor", () => {
	it("sends a claude model to Anthropic and a deepseek model to DeepSeek's compatible endpoint", () => {
		expect(vendorFor("claude-sonnet-5")).toEqual({ name: "anthropic", keyName: "ANTHROPIC_API_KEY" });
		expect(vendorFor("deepseek-flash")).toEqual({
			name: "deepseek",
			keyName: "DEEPSEEK_API_KEY",
			baseURL: "https://api.deepseek.com/anthropic",
		});
	});

	it("reads the key the model's vendor needs, and only that one", () => {
		process.env.ANTHROPIC_API_KEY = "sk-ant";
		delete process.env.DEEPSEEK_API_KEY;
		expect(vendorApiKey("claude-sonnet-5")).toBe("sk-ant");
		expect(vendorApiKey("deepseek-flash")).toBeNull();
	});

	it("builds a client pointed at the vendor, and refuses without its key", () => {
		process.env.DEEPSEEK_API_KEY = "sk-ds";
		const client = createAssistantClient("deepseek-flash");
		expect(client.baseURL).toBe("https://api.deepseek.com/anthropic");
		delete process.env.DEEPSEEK_API_KEY;
		expect(() => createAssistantClient("deepseek-flash")).toThrow(/DEEPSEEK_API_KEY/);
	});
});
