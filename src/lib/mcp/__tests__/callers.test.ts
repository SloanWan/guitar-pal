import { describe, expect, it } from "vitest";
import { callerKey, clientIp, hostedClientFor, ipv4InCidr, parseIpv4 } from "@/lib/mcp/callers";

const headers = (init: Record<string, string>) => new Headers(init);

describe("parseIpv4", () => {
	it("reads dotted quads and IPv4-mapped IPv6", () => {
		expect(parseIpv4("0.0.0.0")).toBe(0);
		expect(parseIpv4("255.255.255.255")).toBe(2 ** 32 - 1);
		expect(parseIpv4("160.79.104.1")).toBe(((160 * 256 + 79) * 256 + 104) * 256 + 1);
		expect(parseIpv4("::ffff:10.0.0.1")).toBe(parseIpv4("10.0.0.1"));
	});

	it("refuses anything else", () => {
		for (const bad of ["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "1.2.3.x", "2001:db8::1", " 1.2.3.4", "1.2.3.-4"]) {
			expect(parseIpv4(bad)).toBeNull();
		}
	});
});

describe("ipv4InCidr", () => {
	it("matches the block's edges and nothing past them", () => {
		// 160.79.104.0/21 runs 160.79.104.0 – 160.79.111.255.
		expect(ipv4InCidr("160.79.104.0", "160.79.104.0/21")).toBe(true);
		expect(ipv4InCidr("160.79.111.255", "160.79.104.0/21")).toBe(true);
		expect(ipv4InCidr("160.79.103.255", "160.79.104.0/21")).toBe(false);
		expect(ipv4InCidr("160.79.112.0", "160.79.104.0/21")).toBe(false);
		// 153.61.208.0/20 runs 153.61.208.0 – 153.61.223.255.
		expect(ipv4InCidr("153.61.223.255", "153.61.208.0/20")).toBe(true);
		expect(ipv4InCidr("153.61.224.0", "153.61.208.0/20")).toBe(false);
	});

	it("handles /0 and /32", () => {
		expect(ipv4InCidr("8.8.8.8", "0.0.0.0/0")).toBe(true);
		expect(ipv4InCidr("8.8.8.8", "8.8.8.8/32")).toBe(true);
		expect(ipv4InCidr("8.8.8.9", "8.8.8.8/32")).toBe(false);
	});

	it("is false for malformed input rather than throwing", () => {
		expect(ipv4InCidr("unknown", "160.79.104.0/21")).toBe(false);
		expect(ipv4InCidr("2001:db8::1", "0.0.0.0/0")).toBe(false);
		expect(ipv4InCidr("1.2.3.4", "1.2.3.0/33")).toBe(false);
		expect(ipv4InCidr("1.2.3.4", "1.2.3.0")).toBe(false);
	});
});

describe("hostedClientFor", () => {
	it("recognises Anthropic's egress ranges as claude", () => {
		expect(hostedClientFor("160.79.106.20")).toBe("claude");
		expect(hostedClientFor("153.61.210.7")).toBe("claude");
		expect(hostedClientFor("::ffff:160.79.106.20")).toBe("claude");
	});

	it("leaves every other address to its own bucket", () => {
		expect(hostedClientFor("203.0.113.9")).toBeNull();
		expect(hostedClientFor("unknown")).toBeNull();
	});
});

describe("clientIp", () => {
	it("takes the hop the proxy appended, not the one the caller sent", () => {
		expect(clientIp(headers({ "x-forwarded-for": "160.79.104.1, 203.0.113.9" }))).toBe("203.0.113.9");
		expect(clientIp(headers({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
	});

	it("falls back to x-real-ip, then to one shared bucket", () => {
		expect(clientIp(headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
		expect(clientIp(headers({ "x-forwarded-for": " , " }))).toBe("unknown");
		expect(clientIp(headers({}))).toBe("unknown");
	});
});

describe("callerKey", () => {
	it("pools a hosted client under one key and keys anyone else by address", () => {
		expect(callerKey(headers({ "x-forwarded-for": "160.79.104.1" }))).toEqual({ key: "hosted:claude", hosted: "claude" });
		expect(callerKey(headers({ "x-forwarded-for": "203.0.113.9" }))).toEqual({ key: "203.0.113.9", hosted: null });
	});

	it("cannot be talked into the hosted bucket by a forged first hop", () => {
		expect(callerKey(headers({ "x-forwarded-for": "160.79.104.1, 203.0.113.9" })).hosted).toBeNull();
	});
});
