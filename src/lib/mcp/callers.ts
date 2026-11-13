/**
 * Who is calling the MCP route, for its rate limits (#491).
 *
 * A call has no user, so the address is the only key. Most clients connect
 * from the player's own machine (Claude Code, Cursor, VS Code), one address a
 * player. A hosted chat product does not: claude.ai calls from Anthropic's
 * own egress ranges, so every claude.ai player in the world arrives from a
 * handful of addresses and would share one per-IP bucket. Those ranges get a
 * bucket of their own, sized for many players; the daily budget for all
 * callers together stays the cap that bounds the worst case.
 */

/** A hosted client whose calls come from its vendor's servers, not the player's machine. */
export type HostedClient = "claude";

/**
 * Published egress ranges, IPv4 only. Anthropic lists these as the addresses
 * its MCP connector calls from: https://platform.claude.com/docs/en/api/ip-addresses
 * OpenAI publishes no egress ranges for ChatGPT's MCP calls, so ChatGPT
 * players are keyed by address like anyone else.
 */
export const HOSTED_CLIENT_RANGES: Readonly<Record<HostedClient, readonly string[]>> = {
	claude: ["160.79.104.0/21", "153.61.208.0/20"],
};

/** A dotted IPv4 address as an unsigned 32-bit number, or null for anything else. */
export function parseIpv4(text: string): number | null {
	// An IPv4 client seen through an IPv6 socket arrives as ::ffff:a.b.c.d.
	const bare = text.toLowerCase().startsWith("::ffff:") ? text.slice(7) : text;
	const parts = bare.split(".");
	if (parts.length !== 4) return null;
	let value = 0;
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return null;
		const octet = Number(part);
		if (octet > 255) return null;
		value = value * 256 + octet;
	}
	return value;
}

/** Whether an IPv4 address lies inside an IPv4 CIDR block; false for anything unparseable. */
export function ipv4InCidr(ip: string, cidr: string): boolean {
	const [base, bitsText] = cidr.split("/");
	const addr = parseIpv4(ip);
	const net = parseIpv4(base ?? "");
	const bits = Number(bitsText);
	if (addr === null || net === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
	// 2 ** (32 - bits) addresses share the block's first address.
	const size = 2 ** (32 - bits);
	return Math.floor(addr / size) === Math.floor(net / size);
}

/** The hosted client an address belongs to, or null for a player's own machine. */
export function hostedClientFor(ip: string): HostedClient | null {
	for (const [client, ranges] of Object.entries(HOSTED_CLIENT_RANGES) as [HostedClient, readonly string[]][]) {
		if (ranges.some((cidr) => ipv4InCidr(ip, cidr))) return client;
	}
	return null;
}

/**
 * The caller's address behind one proxy: the LAST hop of `x-forwarded-for`.
 * nginx appends the address it was connected from (`$proxy_add_x_forwarded_for`)
 * and Vercel writes a single hop, so the last entry is the one no caller can
 * write — the first is whatever the caller sent. Without the header, `x-real-ip`;
 * without either, one shared bucket, which errs safe.
 */
export function clientIp(headers: Headers): string {
	const hops = headers.get("x-forwarded-for")?.split(",").map((hop) => hop.trim()).filter(Boolean);
	return hops?.at(-1) || headers.get("x-real-ip")?.trim() || "unknown";
}

/** The rate-limit key and bucket for a call: one per hosted client, else one per address. */
export interface CallerKey {
	key: string;
	hosted: HostedClient | null;
}

export function callerKey(headers: Headers): CallerKey {
	const ip = clientIp(headers);
	const hosted = hostedClientFor(ip);
	return hosted ? { key: `hosted:${hosted}`, hosted } : { key: ip, hosted: null };
}
