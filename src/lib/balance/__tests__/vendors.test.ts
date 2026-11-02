import { describe, expect, it } from "vitest";
import { VendorError } from "../types";
import { VENDORS } from "../vendors";
import { aliyunBalanceUrl, parseAliyun } from "../vendors/aliyun";
import { parseDeepSeek } from "../vendors/deepseek";

// Each vendor's answer as it came back from a real account, or as its
// documentation prints it where no account was at hand (named per case).

describe("DeepSeek", () => {
	// A real account, 2026-11-02.
	const sample = {
		is_available: true,
		balance_infos: [
			{ currency: "CNY", total_balance: "2.46", granted_balance: "0.00", topped_up_balance: "2.46" },
			{ currency: "USD", total_balance: "0.00", granted_balance: "0.00", topped_up_balance: "0.00" },
		],
	};

	it("keeps the currencies that hold something", () => {
		expect(parseDeepSeek(sample)).toEqual([{ currency: "CNY", balance: 2.46 }]);
	});

	it("says how much of a balance was granted", () => {
		const granted = { balance_infos: [{ currency: "CNY", total_balance: "110.00", granted_balance: "10.00" }] };
		expect(parseDeepSeek(granted)).toEqual([{ currency: "CNY", balance: 110, note: "10.00 of it granted" }]);
	});

	it("shows an empty account rather than nothing", () => {
		const empty = { balance_infos: [{ currency: "CNY", total_balance: "0.00", granted_balance: "0.00" }] };
		expect(parseDeepSeek(empty)).toEqual([{ currency: "CNY", balance: 0 }]);
	});

	it("refuses an answer it does not know", () => {
		expect(() => parseDeepSeek({ error: "x" })).toThrow(VendorError);
	});
});

describe("Alibaba Cloud", () => {
	// help.aliyun.com … api-bssopenapi-2017-12-14-queryaccountbalance
	const sample = {
		Code: "200",
		Message: "success",
		RequestId: "16176743-6DC7-4CB3-BB25-A13982D8DFAD",
		Success: true,
		Data: {
			AvailableAmount: "10000.00",
			CreditAmount: "0.00",
			MybankCreditAmount: "0.00",
			Currency: "CNY",
			AvailableCashAmount: "10000.00",
			QuotaLimit: "10000.00",
		},
	};

	it("reads the account's available amount", () => {
		expect(parseAliyun(sample)).toEqual([{ currency: "CNY", balance: 10000, note: "the whole Alibaba Cloud account" }]);
	});

	it("passes the error message on", () => {
		expect(() => parseAliyun({ Code: "InvalidAccessKeyId.NotFound", Message: "Specified access key is not found.", Success: false })).toThrow(
			"InvalidAccessKeyId.NotFound: Specified access key is not found.",
		);
	});

	it("signs every parameter into the URL", () => {
		const url = new URL(aliyunBalanceUrl("testid", "testsecret", "2023-03-13T08:34:30Z", "nonce-1"));
		expect(url.host).toBe("business.aliyuncs.com");
		expect(Object.fromEntries(url.searchParams)).toMatchObject({
			Action: "QueryAccountBalance",
			Version: "2017-12-14",
			AccessKeyId: "testid",
			Timestamp: "2023-03-13T08:34:30Z",
		});
		expect(url.searchParams.get("Signature")).toMatch(/^[A-Za-z0-9+/]{27}=$/);
	});
});

describe("the vendor list", () => {
	it("checks the vendors the evals use, in order", () => {
		expect(VENDORS.map((v) => v.id)).toEqual(["deepseek", "aliyun"]);
		// Only what has met a real account says so.
		expect(VENDORS.filter((v) => v.verified).map((v) => v.id)).toEqual(["deepseek", "aliyun"]);
	});
});
