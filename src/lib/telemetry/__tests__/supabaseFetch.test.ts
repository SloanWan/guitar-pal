import { describe, expect, it, vi } from "vitest";
import { reportingFetch, supabaseArea } from "../supabaseFetch";

const URL_REST = "https://x.supabase.co/rest/v1/user_strum_patterns?select=*&user_id=eq.123";

describe("supabaseArea", () => {
	it("names the service and the table or endpoint, never the query", () => {
		expect(supabaseArea(URL_REST)).toBe("rest/user_strum_patterns");
		expect(supabaseArea("https://x.supabase.co/auth/v1/token?grant_type=refresh_token")).toBe("auth/token");
		expect(supabaseArea("https://x.supabase.co/storage/v1/object/sign/books/abc.png")).toBe("storage/object");
		expect(supabaseArea("not a url")).toBe("unknown");
	});
});

describe("reportingFetch", () => {
	it("reports a request that got no answer, and still fails it", async () => {
		const report = vi.fn();
		const fetcher = reportingFetch(async () => {
			throw new TypeError("Load failed");
		}, report);
		await expect(fetcher(URL_REST)).rejects.toThrow("Load failed");
		expect(report).toHaveBeenCalledWith(new Error("Supabase rest/user_strum_patterns: network error (Load failed)"));
	});

	it("reports a timeout and a server error, each once", async () => {
		const report = vi.fn();
		const timedOut = Object.assign(new Error("signal timed out"), { name: "TimeoutError" });
		await expect(reportingFetch(async () => Promise.reject(timedOut), report)(URL_REST)).rejects.toBe(timedOut);
		const res = await reportingFetch(async () => new Response(null, { status: 503 }), report)(new URL(URL_REST));
		expect(res.status).toBe(503);
		expect(report.mock.calls.map(([e]) => (e as Error).message)).toEqual([
			"Supabase rest/user_strum_patterns: timed out",
			"Supabase rest/user_strum_patterns: HTTP 503",
		]);
	});

	it("leaves answers alone: a 4xx is the caller's, and an abort the page's own", async () => {
		const report = vi.fn();
		await reportingFetch(async () => new Response(null, { status: 401 }), report)(URL_REST);
		const aborted = Object.assign(new Error("aborted"), { name: "AbortError" });
		await expect(reportingFetch(async () => Promise.reject(aborted), report)(URL_REST)).rejects.toBe(aborted);
		expect(report).not.toHaveBeenCalled();
	});
});
