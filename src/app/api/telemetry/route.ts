import { SlidingWindowLimiter } from "@/lib/assistant/rateLimit";
import { MAX_BATCH_BYTES } from "@/lib/telemetry/events";
import { telemetryBatch } from "@/lib/telemetry/schema";
import { insertRows, isCrawler, telemetryClient, toRow } from "@/lib/telemetry/store";

/**
 * The browser's reports (#447): a batch of errors and Web Vitals from
 * `lib/telemetry/client.ts`, sent with `sendBeacon` as the page goes.
 *
 * Open to everyone, signed in or not, so it is shaped for abuse first: the
 * body is capped before it is parsed, the batch is checked field by field and
 * refused whole if anything is off, each IP gets a few batches a window and
 * every instance a daily budget. A real page sends a handful of batches a visit.
 * Nothing is read back, and the answer never says more than accepted or not.
 */

export const dynamic = "force-dynamic";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Batches per IP: errors a few seconds apart, vitals when a page is hidden. */
const ipLimiter = new SlidingWindowLimiter({ limit: 30, windowMs: 10 * MINUTE_MS });
/** Batches per instance per day, everyone together. */
const DAILY_BATCHES = Number(process.env.TELEMETRY_DAILY_BATCHES) || 20_000;
const dailyBudget = new SlidingWindowLimiter({ limit: DAILY_BATCHES, windowMs: DAY_MS });

/** The first hop of `x-forwarded-for`, which the proxy in front sets; one shared bucket without one. */
function clientIp(request: Request): string {
	const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
	return first || request.headers.get("x-real-ip") || "unknown";
}

const empty = (status: number, headers?: HeadersInit) => new Response(null, { status, headers });

export async function POST(request: Request): Promise<Response> {
	const userAgent = request.headers.get("user-agent");
	// A crawler's reports are accepted and dropped, unread (#453).
	if (isCrawler(userAgent)) return empty(204);

	const perIp = ipLimiter.check(clientIp(request));
	if (!perIp.allowed) return empty(429, { "Retry-After": String(perIp.retryAfterSeconds) });

	const declared = Number(request.headers.get("content-length"));
	if (declared > MAX_BATCH_BYTES) return empty(413);
	const text = await request.text();
	if (text.length > MAX_BATCH_BYTES) return empty(413);

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return empty(400);
	}
	const batch = telemetryBatch.safeParse(body);
	if (!batch.success) return empty(400);

	if (!dailyBudget.check("all").allowed) return empty(429);

	const client = telemetryClient();
	// Not configured here: accepted and dropped, so a browser never retries.
	if (!client) return empty(204);
	try {
		await insertRows(client, batch.data.events.map((event) => toRow(event, userAgent)));
	} catch (error) {
		console.error("[telemetry]", error);
		return empty(503);
	}
	return empty(204);
}
