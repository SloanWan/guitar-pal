import type { Instrumentation } from "next";

/**
 * Server errors (#447): a page that failed to render, a route handler that
 * threw. Written straight to the same table the browser's reports go to, with
 * the route's pattern and the error's digest — the id the error screen shows —
 * so a player's "Error ID" leads to its row. Never the query string or headers.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	try {
		const [{ describeError, routePattern }, { insertRows, telemetryClient }] = await Promise.all([
			import("@/lib/telemetry/events"),
			import("@/lib/telemetry/store"),
		]);
		const client = telemetryClient();
		if (!client) return;
		const { message, stack } = describeError(err);
		const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest).slice(0, 64) : null;
		await insertRows(client, [
			{
				kind: "error",
				source: "server",
				name: null,
				value: null,
				rating: null,
				message,
				stack: stack ?? null,
				digest,
				route: routePattern(request.path),
				viewport: null,
				build: process.env.NEXT_PUBLIC_BUILD_SHA || null,
				user_agent: null,
			},
		]);
	} catch (error) {
		// Reporting a failure must not become one.
		console.error("[telemetry] could not record a server error", error);
	}
};
