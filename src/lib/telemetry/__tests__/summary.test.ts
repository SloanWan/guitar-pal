import { describe, expect, it } from "vitest";
import { bucketKey, bucketKeys, errorGroup, isMalformedRequest, percentile, rateVital, summarize } from "../summary";
import type { StoredEvent } from "../store";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36";
const BOT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Reflectionbot/1.0)";

function vital(name: StoredEvent["name"], value: number, at: string, route = "/chords", viewport: "phone" | "desktop" = "desktop", ua = CHROME): StoredEvent {
	return { at, kind: "vital", source: null, name, value, rating: null, message: null, stack: null, digest: null, route, viewport, build: "b1", user_agent: ua };
}

function error(source: string, message: string, at: string, route = "/tab", viewport: "phone" | "desktop" | null = "desktop", build = "b1"): StoredEvent {
	return { at, kind: "error", source, name: null, value: null, rating: null, message, stack: null, digest: null, route, viewport, build, user_agent: source === "server" ? null : CHROME };
}

const OPTIONS = {
	from: new Date("2026-11-06T00:00:00+08:00"),
	to: new Date("2026-11-08T23:59:59+08:00"),
	bucket: "day" as const,
	viewport: null,
	timeZone: "Asia/Shanghai",
};

describe("percentile", () => {
	it("interpolates between ranks the way percentile_cont does", () => {
		expect(percentile([4, 1, 3, 2], 0.75)).toBe(3.25);
		expect(percentile([10], 0.75)).toBe(10);
		expect(percentile([], 0.75)).toBeNull();
	});
});

describe("rateVital", () => {
	it("rates on Google's thresholds, the edges inclusive of the better band", () => {
		expect(rateVital("LCP", 2500)).toBe("good");
		expect(rateVital("LCP", 2501)).toBe("needs-improvement");
		expect(rateVital("LCP", 4000)).toBe("needs-improvement");
		expect(rateVital("LCP", 4001)).toBe("poor");
		expect(rateVital("CLS", 0.1)).toBe("good");
		expect(rateVital("INP", 600)).toBe("poor");
	});
});

describe("errorGroup and isMalformedRequest", () => {
	it("folds the page's own sources into one group", () => {
		expect(["window", "rejection", "boundary", "component"].map((s) => errorGroup(s as "window"))).toEqual(["page", "page", "page", "page"]);
		expect(errorGroup("supabase")).toBe("supabase");
	});

	it("knows a scanner's malformed body from a page that broke", () => {
		expect(isMalformedRequest("TypeError: Failed to parse body as FormData.")).toBe(true);
		expect(isMalformedRequest("TypeError: Cannot read properties of undefined")).toBe(false);
		expect(isMalformedRequest(null)).toBe(false);
	});
});

describe("bucketKey / bucketKeys", () => {
	it("buckets in the dashboard's time zone", () => {
		expect(bucketKey(new Date("2026-11-08T17:30:00Z"), "day", "Asia/Shanghai")).toBe("2026-11-09");
		expect(bucketKey(new Date("2026-11-08T17:30:00Z"), "hour", "Asia/Shanghai")).toBe("2026-11-09 01");
	});

	it("lists every bucket of the range, empty ones too", () => {
		expect(bucketKeys(OPTIONS.from, OPTIONS.to, "day", "Asia/Shanghai")).toEqual(["2026-11-06", "2026-11-07", "2026-11-08"]);
		expect(bucketKeys(new Date("2026-11-08T10:00:00+08:00"), new Date("2026-11-08T13:30:00+08:00"), "hour", "Asia/Shanghai")).toEqual([
			"2026-11-08 10",
			"2026-11-08 11",
			"2026-11-08 12",
			"2026-11-08 13",
		]);
	});
});

describe("summarize", () => {
	const events: StoredEvent[] = [
		vital("FCP", 1000, "2026-11-07T10:00:00+08:00"),
		vital("FCP", 2000, "2026-11-07T11:00:00+08:00"),
		vital("LCP", 1500, "2026-11-07T10:00:00+08:00"),
		vital("LCP", 4500, "2026-11-07T11:00:00+08:00"),
		vital("FCP", 900, "2026-11-08T09:00:00+08:00", "/tab", "phone"),
		error("window", "Error: test", "2026-11-07T10:05:00+08:00"),
		error("window", "Error: test", "2026-11-08T10:05:00+08:00", "/tab", "desktop", "b2"),
		error("supabase", "Supabase rest/user_visits: network error (Load failed)", "2026-11-08T10:06:00+08:00", "/home", "phone"),
		error("server", "Error: render failed", "2026-11-06T12:00:00+08:00", "/tab", null),
		error("server", "TypeError: Failed to parse body as FormData.", "2026-11-07T19:22:00+08:00", "/", null),
		vital("LCP", 1100, "2026-11-07T23:12:00+08:00", "/auth", "desktop", BOT),
		// Outside the range.
		error("window", "Error: old", "2026-11-01T10:00:00+08:00"),
	];

	it("counts loads, errors per load, and server errors apart from scanners' probes", () => {
		const s = summarize(events, OPTIONS);
		expect(s.loads).toBe(3);
		expect(s.browserErrors).toBe(3);
		expect(s.errorRate).toBe(1);
		expect(s.serverErrors).toBe(1);
		expect(s.automated.malformedRequests).toEqual([{ route: "/", message: "TypeError: Failed to parse body as FormData.", count: 1, lastAt: "2026-11-07T19:22:00+08:00" }]);
	});

	it("keeps crawlers out of every number and lists them on their own", () => {
		const s = summarize(events, OPTIONS);
		expect(s.automated.crawlerRows).toBe(1);
		expect(s.automated.crawlerAgents).toEqual([BOT]);
		expect(s.routes.map((r) => r.route)).not.toContain("/auth");
	});

	it("gives each route its P75s with sample counts, busiest route first", () => {
		const s = summarize(events, OPTIONS);
		expect(s.routes.map((r) => [r.route, r.loads])).toEqual([
			["/chords", 2],
			["/tab", 1],
		]);
		expect(s.routes[0].metrics.LCP).toEqual({ p75: 3750, n: 2, rating: "needs-improvement" });
		expect(s.routes[0].metrics.INP).toEqual({ p75: null, n: 0, rating: null });
		expect(s.overall.LCP.n).toBe(2);
	});

	it("buckets errors by day and group, with the empty days in place", () => {
		const s = summarize(events, OPTIONS);
		expect(s.buckets).toEqual([
			{ key: "2026-11-06", counts: { page: 0, audio: 0, supabase: 0, server: 1 } },
			{ key: "2026-11-07", counts: { page: 1, audio: 0, supabase: 0, server: 0 } },
			{ key: "2026-11-08", counts: { page: 1, audio: 0, supabase: 1, server: 0 } },
		]);
	});

	it("groups recent errors by source, route and message, newest first, with the latest build", () => {
		const s = summarize(events, OPTIONS);
		// The two "Error: test" rows are one error seen twice; it keeps the newer build.
		expect(s.recentErrors.map((e) => [e.source, e.route, e.count, e.build])).toEqual([
			["supabase", "/home", 1, "b1"],
			["window", "/tab", 2, "b2"],
			["server", "/tab", 1, "b1"],
		]);
	});

	it("scopes the browser's rows to one screen class, and keeps the server's", () => {
		const s = summarize(events, { ...OPTIONS, viewport: "phone" });
		expect(s.loads).toBe(1);
		expect(s.browserErrors).toBe(1);
		expect(s.serverErrors).toBe(1);
		expect(s.routes.map((r) => r.route)).toEqual(["/tab"]);
	});

	it("has no error rate without a page load", () => {
		expect(summarize([error("window", "Error: x", "2026-11-07T10:00:00+08:00")], OPTIONS).errorRate).toBeNull();
	});
});
