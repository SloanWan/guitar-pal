// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * The proxy: session in, bearer token out, everything else passed through.
 * The service is replaced by a recorded `fetch`; what matters here is what
 * reaches it and what comes back when it cannot be reached.
 */

const mocks = vi.hoisted(() => ({
	session: { access_token: "session-token" } as { access_token: string } | null,
	fetch: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
	createSupabaseServer: async () => ({
		auth: { getSession: async () => ({ data: { session: mocks.session } }) },
	}),
}));

import { GET, POST, DELETE } from "@/app/api/books/[...path]/route";
import { GET as GET_ROOT } from "@/app/api/books/route";

const params = (...path: string[]) => ({ params: Promise.resolve({ path }) });

function request(method: string, url: string, body?: unknown): NextRequest {
	return new NextRequest(`http://localhost:3000${url}`, {
		method,
		body: body === undefined ? undefined : JSON.stringify(body),
		headers: body === undefined ? undefined : { "Content-Type": "application/json" },
	});
}

beforeEach(() => {
	vi.stubGlobal("fetch", mocks.fetch);
	vi.stubEnv("BOOK_SERVICE_URL", "http://book-service:8000/");
	mocks.session = { access_token: "session-token" };
	mocks.fetch.mockReset();
	mocks.fetch.mockResolvedValue(
		new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		}),
	);
});

describe("/api/books proxy", () => {
	it("forwards the session as a bearer token to the service", async () => {
		const response = await GET(request("GET", "/api/books/abc?x=1"), params("abc"));
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });

		const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("http://book-service:8000/books/abc?x=1");
		expect(init.method).toBe("GET");
		expect(new Headers(init.headers).get("authorization")).toBe("Bearer session-token");
		expect(init.body).toBeUndefined();
	});

	it("passes a JSON body and the service's status back untouched", async () => {
		mocks.fetch.mockResolvedValue(
			new Response(JSON.stringify({ detail: "Book not found." }), { status: 404 }),
		);
		const response = await POST(
			request("POST", "/api/books/abc/scan", { title: "x" }),
			params("abc", "scan"),
		);
		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({ detail: "Book not found." });
		const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
		expect(init.body).toBe(JSON.stringify({ title: "x" }));
		expect(new Headers(init.headers).get("content-type")).toContain("application/json");
	});

	it("reaches the bare /books for the root route", async () => {
		await GET_ROOT(request("GET", "/api/books"));
		expect((mocks.fetch.mock.calls[0] as [string])[0]).toBe("http://book-service:8000/books");
	});

	it("is a 401 without a session and never calls the service", async () => {
		mocks.session = null;
		const response = await DELETE(request("DELETE", "/api/books/abc"), params("abc"));
		expect(response.status).toBe(401);
		expect(mocks.fetch).not.toHaveBeenCalled();
	});

	it("is a 503 when the service is not configured", async () => {
		vi.stubEnv("BOOK_SERVICE_URL", "");
		const response = await GET(request("GET", "/api/books/abc"), params("abc"));
		expect(response.status).toBe(503);
		expect(mocks.fetch).not.toHaveBeenCalled();
	});

	it("is a 502 when the service cannot be reached", async () => {
		mocks.fetch.mockRejectedValue(new Error("ECONNREFUSED"));
		const response = await GET(request("GET", "/api/books/abc"), params("abc"));
		expect(response.status).toBe(502);
		await expect(response.json()).resolves.toEqual({ error: "The book service is not reachable." });
	});
});
