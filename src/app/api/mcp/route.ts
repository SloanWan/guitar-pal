import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createClient } from "@supabase/supabase-js";
import { SlidingWindowLimiter } from "@/lib/assistant/rateLimit";
import { getChordIndex } from "@/lib/chordsData";
import { createGuitarPalServer, ShareRefused, type GuitarPalMcpDeps, type SavedShare } from "@/lib/mcp/server";
import { createShare, loadShare, newShareId, type SharedItem } from "@/lib/sharedItems";

/**
 * The MCP endpoint (#308): `createGuitarPalServer` behind Streamable HTTP.
 *
 * Stateless on purpose. Every POST gets its own server and transport, answers
 * as plain JSON and is done — no session to hold, no SSE stream to keep open,
 * so it runs as an ordinary route handler on any host that runs one. A client
 * that asks for a session (GET for the standalone stream, DELETE to end one)
 * is told there is none.
 *
 * Abuse controls, in the shape `/api/assistant` uses for guests: a call has no
 * user, so the IP is the only key. Reading and listing are cheap and get a
 * loose hourly cap; a share is a row that lives `MCP_SHARE_TTL_DAYS`, so writes
 * get a tighter one per IP and a daily budget for everyone together
 * (`MCP_DAILY_SHARES`) — the number the worst case on one instance cannot
 * exceed. The validators run before any write, so what the budget bounds is
 * playable tabs, not arbitrary payloads.
 *
 * Shares are written with the service role under one account
 * (`MCP_SHARE_OWNER_ID`): `shared_items` insert is owner-scoped under RLS and
 * an MCP call is nobody. With either unset the tools still answer — with a
 * refusal that says so — and nothing else on the site changes.
 */

export const dynamic = "force-dynamic";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Any call, per IP: a conversation is a handful an hour, a script is not. */
const callLimiter = new SlidingWindowLimiter({ limit: 120, windowMs: HOUR_MS });
/** Shares written, per IP. */
const shareIpLimiter = new SlidingWindowLimiter({ limit: 20, windowMs: HOUR_MS });
/** Shares written, everyone, per day. */
const DAILY_SHARES = Number(process.env.MCP_DAILY_SHARES) || 200;
const shareBudget = new SlidingWindowLimiter({ limit: DAILY_SHARES, windowMs: DAY_MS });
/** A tab of MAX_MEASURES bars as JSON is well under this; a body past it was not written by a model. */
const MAX_BODY_BYTES = 512 * 1024;

/** Days a share made here stays open; `0` keeps them forever. */
export function shareTtlDays(env: NodeJS.ProcessEnv = process.env): number {
	const raw = env.MCP_SHARE_TTL_DAYS;
	if (raw === undefined || raw.trim() === "") return 30;
	const days = Number(raw);
	return Number.isFinite(days) && days >= 0 ? days : 30;
}

/** The first hop of `x-forwarded-for`, which the platform in front sets; one shared bucket without a proxy, which errs safe. */
function clientIp(request: Request): string {
	const forwarded = request.headers.get("x-forwarded-for");
	const first = forwarded?.split(",")[0]?.trim();
	return first || request.headers.get("x-real-ip") || "unknown";
}

/** The origin the player reaches the site at, for the links in tool results. */
export function requestOrigin(request: Request): string {
	const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
	if (!host) return new URL(request.url).origin;
	const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
	return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

function rpcError(status: number, code: number, message: string, headers?: HeadersInit): Response {
	return Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status, headers });
}

function adminClient() {
	return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

function depsFor(request: Request): GuitarPalMcpDeps {
	const ip = clientIp(request);
	return {
		chordIndex: getChordIndex,
		origin: requestOrigin(request),
		async loadShare(id) {
			// Reads go under the anon key like the page does: the id is the capability.
			const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
				auth: { persistSession: false, autoRefreshToken: false },
			});
			return loadShare(anon, id);
		},
		async saveShare(item: SharedItem): Promise<SavedShare> {
			const ownerId = process.env.MCP_SHARE_OWNER_ID;
			if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !ownerId) {
				console.error("[mcp] SUPABASE_SERVICE_ROLE_KEY or MCP_SHARE_OWNER_ID is unset; shares cannot be written");
				throw new ShareRefused("This Guitar Pal server is not set up to save links yet. Give the player the pattern as text instead.");
			}
			const perIp = shareIpLimiter.check(ip);
			if (!perIp.allowed) {
				throw new ShareRefused(`Too many links from here in the last hour; try again in ${Math.ceil(perIp.retryAfterSeconds / 60)} minutes. Give the player the pattern as text meanwhile.`);
			}
			const budget = shareBudget.check("all");
			if (!budget.allowed) {
				throw new ShareRefused("Guitar Pal has made all the links it makes in a day; try again tomorrow. Give the player the pattern as text meanwhile.");
			}
			const id = newShareId();
			const days = shareTtlDays();
			const expiresAt = days > 0 ? new Date(Date.now() + days * DAY_MS) : undefined;
			await createShare(adminClient(), { id: ownerId }, id, item, expiresAt ? { expiresAt } : {});
			return expiresAt ? { id, expiresAt } : { id };
		},
	};
}

export async function POST(request: Request): Promise<Response> {
	const verdict = callLimiter.check(clientIp(request));
	if (!verdict.allowed) {
		return rpcError(429, -32000, "Too many requests; try again later.", { "Retry-After": String(verdict.retryAfterSeconds) });
	}
	const server = createGuitarPalServer(depsFor(request));
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
		maxRequestBodySize: MAX_BODY_BYTES,
	});
	try {
		await server.connect(transport);
		return await transport.handleRequest(request);
	} catch (error) {
		console.error("[mcp] request failed", error);
		return rpcError(500, -32603, "Internal server error.");
	} finally {
		// JSON mode: the response is whole by the time handleRequest resolves,
		// so nothing is cut off; closing releases the per-request server.
		void transport.close().catch(() => undefined);
	}
}

/** No sessions here, so there is no stream to open and none to end. */
function noSession(): Response {
	return rpcError(405, -32000, "This server is stateless: POST each request.", { Allow: "POST" });
}

export function GET(): Response {
	return noSession();
}

export function DELETE(): Response {
	return noSession();
}
