// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The report endpoint end to end, with Supabase replaced: the checks, the caps and what is written. */

const mocks = vi.hoisted(() => ({
	insert: vi.fn<(rows: unknown) => Promise<{ error: { message: string } | null }>>(async () => ({ error: null })),
	table: "",
}));

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({
		from: (table: string) => {
			mocks.table = table;
			return { insert: mocks.insert };
		},
	}),
}));

import { POST } from "@/app/api/telemetry/route";

const ENV = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service" };

let ipSeq = 0;
function post(body: string, ip = `198.51.100.${++ipSeq}`): Promise<Response> {
	return POST(
		new Request("https://guitarpal.test/api/telemetry", {
			method: "POST",
			headers: { "content-type": "application/json", "x-forwarded-for": ip, "user-agent": "Mozilla/5.0 (iPhone)" },
			body,
		}),
	);
}

const vital = { kind: "vital", name: "LCP", value: 2100, rating: "good", route: "/chords/[rootSlug]/[suffixSlug]", viewport: "phone", build: "abc" };
const error = { kind: "error", source: "boundary", message: "TypeError: x", stack: "at y", digest: "123", route: "/tab", viewport: "desktop" };

beforeEach(() => {
	for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
	mocks.insert.mockClear();
	mocks.insert.mockImplementation(async () => ({ error: null }));
});
afterEach(() => {
	vi.unstubAllEnvs();
});

describe("POST /api/telemetry", () => {
	it("writes a valid batch, one row an event, with the browser's user agent", async () => {
		const res = await post(JSON.stringify({ events: [vital, error] }));
		expect(res.status).toBe(204);
		expect(mocks.table).toBe("telemetry_events");
		expect(mocks.insert).toHaveBeenCalledTimes(1);
		expect(mocks.insert.mock.calls[0][0]).toEqual([
			{ kind: "vital", source: null, name: "LCP", value: 2100, rating: "good", message: null, stack: null, digest: null, route: vital.route, viewport: "phone", build: "abc", user_agent: "Mozilla/5.0 (iPhone)" },
			{ kind: "error", source: "boundary", name: null, value: null, rating: null, message: "TypeError: x", stack: "at y", digest: "123", route: "/tab", viewport: "desktop", build: null, user_agent: "Mozilla/5.0 (iPhone)" },
		]);
	});

	it("refuses a body that is not JSON, or not a batch, and writes nothing", async () => {
		expect((await post("{not json")).status).toBe(400);
		expect((await post(JSON.stringify({ events: [{ ...error, source: "console" }] }))).status).toBe(400);
		expect((await post(JSON.stringify({ events: [] }))).status).toBe(400);
		expect(mocks.insert).not.toHaveBeenCalled();
	});

	it("refuses an oversized body before parsing it", async () => {
		const res = await post(JSON.stringify({ events: [{ ...error, message: "m" }], pad: "x".repeat(70 * 1024) }));
		expect(res.status).toBe(413);
		expect(mocks.insert).not.toHaveBeenCalled();
	});

	it("cuts off a flood from one address", async () => {
		const body = JSON.stringify({ events: [vital] });
		const statuses: number[] = [];
		for (let i = 0; i < 32; i++) statuses.push((await post(body, "203.0.113.99")).status);
		expect(statuses.slice(0, 30).every((s) => s === 204)).toBe(true);
		expect(statuses.slice(30)).toEqual([429, 429]);
		expect(mocks.insert).toHaveBeenCalledTimes(30);
		// another address is not held up by it
		expect((await post(body, "203.0.113.100")).status).toBe(204);
	});

	it("accepts and drops a batch where the service role is not configured", async () => {
		vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
		expect((await post(JSON.stringify({ events: [vital] }))).status).toBe(204);
		expect(mocks.insert).not.toHaveBeenCalled();
	});

	it("answers 503 when the write fails, and says nothing more", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		mocks.insert.mockImplementation(async () => ({ error: { message: "relation does not exist" } }));
		const res = await post(JSON.stringify({ events: [vital] }));
		expect(res.status).toBe(503);
		expect(await res.text()).toBe("");
	});
});
