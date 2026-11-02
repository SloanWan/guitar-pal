import { createHmac } from "node:crypto";

/**
 * Alibaba Cloud's request signature, by hand with `node:crypto` rather than
 * its SDK (#430); checked against the signing guide's worked example in the
 * tests.
 */

/** RFC 3986 percent-encoding, as the canonical form asks. */
export function percentEncode(value: string): string {
	return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Query parameters sorted by name, each name and value encoded. */
export function canonicalQuery(params: Readonly<Record<string, string>>): string {
	return Object.keys(params)
		.sort()
		.map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
		.join("&");
}

// ─── Alibaba Cloud RPC, SignatureVersion 1.0 (HMAC-SHA1) ───────────────────────

/**
 * `Signature` for an RPC call: every other parameter, sorted and encoded, as
 * `METHOD&%2F&<encoded query>`, signed with the secret plus `&`.
 */
export function aliyunRpcSignature(method: "GET" | "POST", params: Readonly<Record<string, string>>, secret: string): string {
	const stringToSign = `${method}&${percentEncode("/")}&${percentEncode(canonicalQuery(params))}`;
	return createHmac("sha1", `${secret}&`).update(stringToSign, "utf8").digest("base64");
}
