import Anthropic from "@anthropic-ai/sdk";

/**
 * Which vendor serves a model, and how to reach it. Server-side only: the
 * keys live here.
 *
 * Every model is spoken to through the Anthropic SDK. A `claude-` model goes
 * to Anthropic; a `deepseek-` model to DeepSeek's Anthropic-compatible
 * endpoint, which takes the same messages, tools and thinking switch (and
 * ignores `cache_control`). Nothing else in the route or the eval runner
 * knows which is which: they ask here for the client and the key's name.
 */

export type VendorKey = "ANTHROPIC_API_KEY" | "DEEPSEEK_API_KEY";

export interface Vendor {
	name: "anthropic" | "deepseek";
	/** The env var holding the key; named so a 503 can say which is unset. */
	keyName: VendorKey;
	baseURL?: string;
}

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/anthropic";

export function vendorFor(model: string): Vendor {
	if (model.startsWith("deepseek-")) return { name: "deepseek", keyName: "DEEPSEEK_API_KEY", baseURL: DEEPSEEK_BASE_URL };
	return { name: "anthropic", keyName: "ANTHROPIC_API_KEY" };
}

/** The vendor's key from the environment, or null when it is unset. */
export function vendorApiKey(model: string): string | null {
	return process.env[vendorFor(model).keyName] || null;
}

/** A client for the model's vendor. Throws when the key is unset; check `vendorApiKey` first to answer politely. */
export function createAssistantClient(model: string): Anthropic {
	const vendor = vendorFor(model);
	const apiKey = process.env[vendor.keyName];
	if (!apiKey) throw new Error(`${vendor.keyName} is not set; ${model} is served by ${vendor.name}.`);
	return new Anthropic({ apiKey, ...(vendor.baseURL ? { baseURL: vendor.baseURL } : {}) });
}
