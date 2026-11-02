import { describe, expect, it } from "vitest";
import { amount, checkAll, checkVendor, errorMessage, formatTable, readJson, redact } from "../check";
import type { Http, VendorCheck } from "../types";
import { VendorError } from "../types";

const answer = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
const never: Http = () => Promise.reject(new Error("no network in tests"));

const vendor = (over: Partial<VendorCheck> = {}): VendorCheck => ({
	id: "v",
	label: "Vendor",
	env: ["V_KEY"],
	console: "https://example.com/billing",
	verified: true,
	read: async () => [{ currency: "USD", balance: 5 }],
	...over,
});

describe("amount", () => {
	it("reads numbers and decimal strings, thousands separators included", () => {
		expect(amount(1.5)).toBe(1.5);
		expect(amount("2.46")).toBe(2.46);
		expect(amount("10,000.00")).toBe(10000);
		expect(amount("")).toBeUndefined();
		expect(amount("n/a")).toBeUndefined();
		expect(amount(null)).toBeUndefined();
	});
});

describe("redact", () => {
	it("cuts every credential out of a message", () => {
		expect(redact("401 for key sk-abcdef123 and sk-abcdef123", ["sk-abcdef123"])).toBe(
			"401 for key [redacted] and [redacted]",
		);
		// An empty or tiny value would blank out ordinary text.
		expect(redact("abc", ["", "a"])).toBe("abc");
	});
});

describe("checkVendor", () => {
	it("names the variables a vendor needs when one is unset", async () => {
		const rows = await checkVendor(vendor({ env: ["A_ID", "A_SECRET"] }), { A_ID: "x" }, never);
		expect(rows).toEqual([expect.objectContaining({ state: "unset", note: "set A_SECRET to check" })]);
	});

	it("adds the vendor's hint when its other keys are easy to mistake", async () => {
		const rows = await checkVendor(vendor({ unsetHint: "an AccessKey" }), {}, never);
		expect(rows[0].note).toBe("set V_KEY to check (an AccessKey)");
	});

	it("turns a failure into an error row with the key cut out", async () => {
		const leaky = vendor({
			read: async () => {
				throw new VendorError("HTTP 401: bad key sk-secret-value");
			},
		});
		const rows = await checkVendor(leaky, { V_KEY: "sk-secret-value" }, never);
		expect(rows).toEqual([expect.objectContaining({ state: "error", note: "HTTP 401: bad key [redacted]" })]);
	});

	it("gives each currency its own row", async () => {
		const two = vendor({
			read: async () => [
				{ currency: "CNY", balance: 2 },
				{ currency: "USD", balance: 1 },
			],
		});
		const rows = await checkVendor(two, { V_KEY: "k" }, never);
		expect(rows.map((r) => [r.state, r.currency, r.balance])).toEqual([
			["ok", "CNY", 2],
			["ok", "USD", 1],
		]);
	});
});

describe("checkAll", () => {
	it("keeps going past a vendor that fails", async () => {
		const broken = vendor({
			id: "b",
			read: async (_env, http) => {
				await http("https://broken.example");
				return [];
			},
		});
		const fine = vendor({ id: "f" });
		const rows = await checkAll([broken, fine], { V_KEY: "k" }, never);
		expect(rows.map((r) => [r.vendor, r.state])).toEqual([
			["b", "error"],
			["f", "ok"],
		]);
	});
});

describe("formatTable", () => {
	it("lines the figures up and says what is unverified or missing", () => {
		const table = formatTable([
			{ vendor: "a", label: "Alpha", state: "ok", balance: 12.5, currency: "USD", console: "c", verified: false },
			{ vendor: "b", label: "Beta", state: "unset", note: "set B_KEY to check", console: "c", verified: true },
			{ vendor: "c", label: "Gamma", state: "error", note: "HTTP 401: bad key", console: "https://c.example", verified: true },
		]);
		const lines = table.split("\n");
		expect(lines[0]).toMatch(/^Vendor\s+Left\s+Currency\s+Note$/);
		expect(lines[2]).toContain("12.50");
		expect(lines[2]).toContain("unverified endpoint");
		expect(lines[3]).toContain("set B_KEY to check");
		expect(lines[4]).toContain("error: HTTP 401: bad key · https://c.example");
	});
});

describe("a vendor's http", () => {
	it("is the one the runner passes, with a timeout attached", async () => {
		let signal: AbortSignal | null | undefined;
		const spy: Http = async (_url, init) => {
			signal = init?.signal;
			return answer({});
		};
		const reads = vendor({
			read: async (_env, http) => {
				await http("https://example.com");
				return [{ currency: "USD" }];
			},
		});
		await checkVendor(reads, { V_KEY: "k" }, spy);
		expect(signal).toBeInstanceOf(AbortSignal);
	});
});

describe("errorMessage", () => {
	it("finds the message in each vendor's error shape", () => {
		expect(errorMessage({ error: { message: "API key is invalid.", type: "authentication_error" } })).toBe("API key is invalid.");
		expect(errorMessage({ error: "nope" })).toBe("nope");
		expect(errorMessage({ Code: "InvalidAccessKeyId.NotFound", Message: "Specified access key is not found." })).toBe(
			"InvalidAccessKeyId.NotFound: Specified access key is not found.",
		);
		expect(errorMessage({ Code: "200", Message: "ok" })).toBe("ok");
		expect(errorMessage({ data: 1 })).toBeNull();
	});
});

describe("readJson", () => {
	it("puts a failed answer's message on one line", async () => {
		const body = JSON.stringify({ error: { message: "Incorrect API key\n provided", type: "x" } }, null, 2);
		await expect(readJson(new Response(body, { status: 401 }))).rejects.toThrow("HTTP 401: Incorrect API key provided");
	});

	it("says when an answer is not JSON", async () => {
		await expect(readJson(new Response("<html>", { status: 502 }))).rejects.toThrow("not JSON (HTTP 502): <html>");
	});
});
