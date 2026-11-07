import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TelemetryEvent } from "./events";

/**
 * Where reports land (#447): `telemetry_events`, written with the service role
 * only — the table grants nothing to anon or authenticated, so no browser can
 * read or write it directly. The one module that knows the table, so a vendor
 * could replace it without the route or the instrumentation noticing.
 */

const MAX_USER_AGENT_CHARS = 200;

export interface TelemetryRow {
	kind: "error" | "vital";
	source: string | null;
	name: string | null;
	value: number | null;
	rating: string | null;
	message: string | null;
	stack: string | null;
	digest: string | null;
	route: string;
	/** null for a server error: the server never saw the screen. */
	viewport: string | null;
	build: string | null;
	user_agent: string | null;
}

export function toRow(event: TelemetryEvent, userAgent: string | null): TelemetryRow {
	const common = {
		route: event.route,
		viewport: event.viewport,
		build: event.build ?? null,
		user_agent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_CHARS) : null,
	};
	if (event.kind === "vital") {
		return { kind: "vital", source: null, name: event.name, value: event.value, rating: event.rating, message: null, stack: null, digest: null, ...common };
	}
	return {
		kind: "error",
		source: event.source,
		name: null,
		value: null,
		rating: null,
		message: event.message,
		stack: event.stack ?? null,
		digest: event.digest ?? null,
		...common,
	};
}

/** The service-role client, or null where the key is not configured (then reports are dropped). */
export function telemetryClient(env: NodeJS.ProcessEnv = process.env): SupabaseClient | null {
	const url = env.NEXT_PUBLIC_SUPABASE_URL;
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) return null;
	return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function insertRows(client: SupabaseClient, rows: TelemetryRow[]): Promise<void> {
	// Spelled out, so the schema snapshot test sees the table this queries.
	const { error } = await client.from("telemetry_events").insert(rows);
	if (error) throw new Error(`telemetry insert failed: ${error.message}`);
}
