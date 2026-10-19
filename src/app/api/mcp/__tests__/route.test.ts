// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The endpoint end to end: JSON-RPC in, JSON out, with Supabase replaced.
 * The tools themselves are covered in src/lib/mcp/__tests__/server.test.ts;
 * this is the transport, the limits and the configuration guard.
 */

const mocks = vi.hoisted(() => ({
	insert: vi.fn(async () => ({ error: null })),
	row: null as { id: string; kind: string; payload: unknown; expires_at: string | null } | null,
}));

vi.mock("@/lib/chordsData", async () => {
	const { INDEX } = await import("@/lib/assistant/tab/__tests__/fixtures");
	return { getChordIndex: async () => INDEX };
});

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({
		from: () => ({
			insert: mocks.insert,
			select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.row, error: null }) }) }),
		}),
	}),
}));

import { DELETE, GET, POST, requestOrigin, shareTtlDays } from "@/app/api/mcp/route";

const ENV = {
	NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
	NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
	SUPABASE_SERVICE_ROLE_KEY: "service",
	MCP_SHARE_OWNER_ID: "00000000-0000-0000-0000-000000000001",
};

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
	return POST(
		new Request("https://guitarpal.test/api/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				"x-forwarded-for": headers["x-forwarded-for"] ?? "203.0.113.7",
				...headers,
			},
			body: JSON.stringify(body),
		}),
	);
}

let seq = 0;
const rpc = (method: string, params: unknown = {}) => ({ jsonrpc: "2.0", id: ++seq, method, params });

type ToolText = { result: { content: { text: string }[]; isError?: boolean } };

async function callTool(name: string, args: Record<string, unknown>, headers: Record<string, string> = {}): Promise<ToolText["result"]> {
	const res = await post(rpc("tools/call", { name, arguments: args }), headers);
	expect(res.status).toBe(200);
	return ((await res.json()) as ToolText).result;
}

beforeEach(() => {
	Object.assign(process.env, ENV);
	delete process.env.MCP_SHARE_TTL_DAYS;
	mocks.insert.mockClear();
	mocks.row = null;
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("POST /api/mcp", () => {
	it("answers initialize as JSON with the server's name, no session", async () => {
		const res = await post(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } }));
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/application\/json/);
		expect(res.headers.get("mcp-session-id")).toBeNull();
		const body = (await res.json()) as { result: { serverInfo: { name: string } } };
		expect(body.result.serverInfo.name).toBe("guitar-pal");
	});

	it("lists the tools without an initialize first — every request stands alone", async () => {
		const res = await post(rpc("tools/list"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as { result: { tools: { name: string }[] } };
		expect(body.result.tools.map((t) => t.name).sort()).toEqual(["import_tab", "propose_strum", "propose_tab", "read_share"]);
	});

	it("writes a share under the configured owner with an expiry, and links to the request's host", async () => {
		const result = await callTool("propose_strum", { name: "Folk", rhythm: "D DU UD ", chords: ["C"], bpm: 0 }, { "x-forwarded-host": "guitarpal.example", "x-forwarded-proto": "https" });
		expect(result.isError).toBeUndefined();
		expect(result.content[0].text).toMatch(/https:\/\/guitarpal\.example\/p\/[A-Za-z0-9]{10}/);
		expect(mocks.insert).toHaveBeenCalledTimes(1);
		const row = mocks.insert.mock.calls[0][0] as unknown as { owner_id: string; kind: string; expires_at?: string };
		expect(row.owner_id).toBe(ENV.MCP_SHARE_OWNER_ID);
		expect(row.kind).toBe("strum");
		expect(Date.parse(row.expires_at!)).toBeGreaterThan(Date.now() + 29 * 86_400_000);
	});

	it("keeps a share forever when the TTL is 0", async () => {
		process.env.MCP_SHARE_TTL_DAYS = "0";
		const result = await callTool("propose_strum", { name: "Folk", rhythm: "D DU UD ", chords: [], bpm: 0 });
		expect(result.isError).toBeUndefined();
		expect(result.content[0].text).not.toMatch(/stops opening/);
		const row = mocks.insert.mock.calls[0][0] as unknown as { expires_at?: string };
		expect(row.expires_at).toBeUndefined();
	});

	it("refuses to save, in words for the player, when the service role or owner is unset", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		delete process.env.MCP_SHARE_OWNER_ID;
		const result = await callTool("propose_strum", { name: "Folk", rhythm: "D DU UD ", chords: [], bpm: 0 });
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toMatch(/not set up to save links/);
		expect(mocks.insert).not.toHaveBeenCalled();
	});

	it("reads a share back under the anon key, and treats an expired row as gone", async () => {
		mocks.row = {
			id: "aB3xK9mQ2z",
			kind: "strum",
			payload: { pattern: { name: "Old", beats: [["D", ""], ["D", "U"], ["", "U"], ["D", ""]], bpm: 80, meter: [4, 4] } },
			expires_at: null,
		};
		const live = await callTool("read_share", { link: "https://guitarpal.test/p/aB3xK9mQ2z" });
		expect(live.isError).toBeUndefined();
		expect(live.content[0].text).toContain("Name: Old");

		mocks.row.expires_at = new Date(Date.now() - 1000).toISOString();
		const gone = await callTool("read_share", { link: "aB3xK9mQ2z" });
		expect(gone.isError).toBe(true);
	});

	it("rejects a body that is not JSON-RPC", async () => {
		const res = await post({ hello: "world" });
		expect(res.status).toBe(400);
	});

	it("caps share writes per IP and says when to come back", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const ip = "198.51.100.42";
		let refused: string | null = null;
		for (let i = 0; i < 21 && refused === null; i++) {
			const r = await callTool("propose_strum", { name: "Folk", rhythm: "D DU UD ", chords: [], bpm: 0 }, { "x-forwarded-for": ip });
			if (r.isError) refused = r.content[0].text;
		}
		expect(refused).toMatch(/Too many links from here/);
		expect(mocks.insert).toHaveBeenCalledTimes(20);
	});
});

describe("GET / DELETE /api/mcp", () => {
	it("say the server is stateless", async () => {
		for (const res of [GET(), DELETE()]) {
			expect(res.status).toBe(405);
			expect(res.headers.get("allow")).toBe("POST");
			const body = (await res.json()) as { error: { message: string } };
			expect(body.error.message).toMatch(/stateless/);
		}
	});
});

describe("helpers", () => {
	it("shareTtlDays: 30 unless set, 0 allowed, junk ignored", () => {
		expect(shareTtlDays({})).toBe(30);
		expect(shareTtlDays({ MCP_SHARE_TTL_DAYS: "7" })).toBe(7);
		expect(shareTtlDays({ MCP_SHARE_TTL_DAYS: "0" })).toBe(0);
		expect(shareTtlDays({ MCP_SHARE_TTL_DAYS: "soon" })).toBe(30);
		expect(shareTtlDays({ MCP_SHARE_TTL_DAYS: "-3" })).toBe(30);
	});

	it("requestOrigin: forwarded headers first, then the host, then the URL", () => {
		const make = (headers: Record<string, string>) => new Request("http://10.0.0.1:3000/api/mcp", { headers });
		expect(requestOrigin(make({ "x-forwarded-host": "guitarpal.example", "x-forwarded-proto": "https" }))).toBe("https://guitarpal.example");
		expect(requestOrigin(make({ host: "guitarpal.example" }))).toBe("https://guitarpal.example");
		expect(requestOrigin(make({ host: "localhost:3000" }))).toBe("http://localhost:3000");
		expect(requestOrigin(new Request("http://10.0.0.1:3000/api/mcp"))).toBe("http://10.0.0.1:3000");
	});
});
