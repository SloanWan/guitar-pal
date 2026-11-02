import { randomUUID } from "node:crypto";
import { amount, readJson, record } from "../check";
import { aliyunRpcSignature, canonicalQuery, percentEncode } from "../sign";
import type { Reading, VendorCheck } from "../types";
import { VendorError } from "../types";

const HOST = "business.aliyuncs.com";

/** BSS `QueryAccountBalance` as a signed RPC GET (Version 2017-12-14, no parameters of its own). */
export function aliyunBalanceUrl(accessKeyId: string, secret: string, timestamp: string, nonce: string): string {
	const params = {
		AccessKeyId: accessKeyId,
		Action: "QueryAccountBalance",
		Format: "JSON",
		SignatureMethod: "HMAC-SHA1",
		SignatureNonce: nonce,
		SignatureVersion: "1.0",
		Timestamp: timestamp,
		Version: "2017-12-14",
	};
	const signature = aliyunRpcSignature("GET", params, secret);
	return `https://${HOST}/?${canonicalQuery(params)}&Signature=${percentEncode(signature)}`;
}

/**
 * `{ Code, Success, Data: { AvailableAmount, Currency, … } }`, amounts as
 * strings. It is the whole account's balance, not Bailian's alone.
 */
export function parseAliyun(body: unknown): Reading[] {
	const top = record(body, "the balance");
	if (top.Success !== true) throw new VendorError(`${String(top.Code)}: ${String(top.Message)}`);
	const data = record(top.Data, "Data");
	return [
		{
			currency: String(data.Currency ?? "CNY"),
			balance: amount(data.AvailableAmount),
			note: "the whole Alibaba Cloud account",
		},
	];
}

export const aliyun: VendorCheck = {
	id: "aliyun",
	label: "Alibaba Cloud (Bailian)",
	env: ["ALIBABA_CLOUD_ACCESS_KEY_ID", "ALIBABA_CLOUD_ACCESS_KEY_SECRET"],
	unsetHint: "an AccessKey; DASHSCOPE_API_KEY only calls models",
	console: "https://expense.console.aliyun.com",
	// A read-only RAM user with only `bss:DescribeAcccount` read the ¥5.00 the
	// account had just been topped up with (2026-11-02).
	verified: true,
	async read(env, http) {
		const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
		const url = aliyunBalanceUrl(env.ALIBABA_CLOUD_ACCESS_KEY_ID ?? "", env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ?? "", timestamp, randomUUID());
		return parseAliyun(await readJson(await http(url)));
	},
};
