import { createBrowserClient } from "@supabase/ssr";
import { reportError } from "@/lib/telemetry/client";
import { reportingFetch } from "@/lib/telemetry/supabaseFetch";

// Every request the browser makes to Supabase goes through it: one that gets no
// answer, or a server error, is reported as `supabase` (#458).
const fetchReporting =
	typeof window === "undefined" ? undefined : reportingFetch((input, init) => fetch(input, init), (failure) => reportError(failure, "supabase"));

export function createClient() {
	return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
		global: fetchReporting ? { fetch: fetchReporting } : undefined,
	});
}
