/**
 * The browser's Supabase client fetches through this (#458): a request that got
 * no answer (offline, a link that stalls, a timeout) or a server error is
 * reported, so the dashboard shows how often visitors cannot reach Supabase.
 * A 4xx is an answer — signed out, refused by RLS, a bad query — and is the
 * caller's to handle; a request the page itself aborted is not a failure.
 *
 * The report names the service and the table or endpoint only: never a query
 * string, an id, a token or a body.
 */

/** `rest/user_strum_patterns`, `auth/token`, `storage/object`, or the bare host's first segment. */
export function supabaseArea(url: string): string {
	let path: string;
	try {
		path = new URL(url).pathname;
	} catch {
		return "unknown";
	}
	const [service, version, name] = path.split("/").filter(Boolean);
	if (!service) return "unknown";
	if (version === "v1" && name) return `${service}/${name}`;
	return service;
}

function urlOf(input: RequestInfo | URL): string {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.href;
	return input.url;
}

export function reportingFetch(base: typeof fetch, report: (failure: Error) => void): typeof fetch {
	return async (input, init) => {
		const area = supabaseArea(urlOf(input));
		let res: Response;
		try {
			res = await base(input, init);
		} catch (err) {
			const name = err instanceof Error ? err.name : "";
			if (name !== "AbortError") {
				const reason = name === "TimeoutError" ? "timed out" : `network error (${err instanceof Error ? err.message : String(err)})`;
				report(new Error(`Supabase ${area}: ${reason}`));
			}
			throw err;
		}
		if (res.status >= 500) report(new Error(`Supabase ${area}: HTTP ${res.status}`));
		return res;
	};
}
